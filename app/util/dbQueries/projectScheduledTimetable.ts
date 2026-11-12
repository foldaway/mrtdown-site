import { ScheduledTimetablePagesEntrySchema } from '@mrtdown/core';
import {
  hashBytes,
  readScheduledTimetablePagesBundle,
  readScheduleTopology,
  verifyScheduledTimetableForCanonicalData,
} from '@mrtdown/fs';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { getDb } from '~/db';
import {
  combinedDepartureMembershipsTable as combinedMemberships,
  combinedDepartureOccurrencesTable as combinedOccurrences,
  scheduledDepartureDaysTable as days,
  scheduledDepartureOccurrencesTable as occurrences,
  scheduledDepartureProjectionsTable as projections,
  scheduledDepartureScopesTable as scopes,
} from '~/db/scheduledDepartures.schema';
import { scheduledTimetablesTable as timetables } from '~/db/scheduledTimetables.schema';
import { combinedDepartureRows } from './combinedDepartureRows';
import {
  combinedServiceDateRange,
  verifyRetainedCombinedTimetable,
} from './combinedTimetableAdmission';
import { scheduledDepartureRows } from './scheduledDepartureRows';
import {
  scheduledTimetableHistoryColumns,
  validateScheduledTimetableHistory,
} from './scheduledTimetableHistory';

export const SCHEDULED_DEPARTURE_PROJECTOR_VERSION = 1;
export const COMBINED_DEPARTURE_PROJECTOR_VERSION = 2;
const batchSize = 500;

type ProjectionOptions = {
  manifestSha256: string;
  projectorVersion:
    | typeof SCHEDULED_DEPARTURE_PROJECTOR_VERSION
    | typeof COMBINED_DEPARTURE_PROJECTOR_VERSION;
  canonicalDataDir: string;
  reuseCompleted?: boolean;
};

/**
 * Internal only. Retention must be trusted, admitted append-only state. The
 * caller supplies an independently trusted canonical snapshot directory that
 * stays immutable throughout this call, never a mutable live data tree.
 * Compatibility is rechecked here; a retention receipt alone is insufficient.
 */
export async function projectScheduledTimetable(
  db: ReturnType<typeof getDb>,
  options: ProjectionOptions,
) {
  const { manifestSha256, projectorVersion } = options;
  if (
    projectorVersion !== SCHEDULED_DEPARTURE_PROJECTOR_VERSION &&
    projectorVersion !== COMBINED_DEPARTURE_PROJECTOR_VERSION
  ) {
    throw new Error('Unsupported scheduled departure projector version');
  }
  const identity = and(
    eq(projections.manifest_sha256, manifestSha256),
    eq(projections.projector_version, projectorVersion),
  );
  const result = await db.transaction(async (tx) => {
    // The retained parent exists before any derived identity. Its row lock also
    // serializes first builds and prevents its bytes changing during validation.
    const [retained] = await tx
      .select()
      .from(timetables)
      .where(eq(timetables.manifest_sha256, manifestSha256))
      .for('update');
    if (!retained) {
      throw new Error('Scheduled timetable manifest is not retained');
    }
    try {
      const projection = await tx.transaction(async (build) => {
        const history = await build
          .select(scheduledTimetableHistoryColumns)
          .from(timetables);
        validateScheduledTimetableHistory(history);
        const source =
          projectorVersion === COMBINED_DEPARTURE_PROJECTOR_VERSION
            ? await combinedProjectionSource(retained, options)
            : await legacyProjectionSource(retained, options);
        const metadata = {
          manifest_sha256: manifestSha256,
          projector_version: projectorVersion,
          topology_sha256: source.topology.sha256,
          topology_projection_version: source.topology.projectionVersion,
          feed_start_date: source.range.startDate,
          feed_end_date: source.range.endDate,
          maximum_departure_seconds: source.maximumDepartureSeconds,
          completed_at: null,
        };
        if (options.reuseCompleted) {
          const [completed] = await build
            .select({ id: projections.id })
            .from(projections)
            .where(
              and(
                identity,
                isNotNull(projections.completed_at),
                eq(projections.topology_sha256, metadata.topology_sha256),
                eq(
                  projections.topology_projection_version,
                  metadata.topology_projection_version,
                ),
                eq(projections.feed_start_date, metadata.feed_start_date),
                eq(projections.feed_end_date, metadata.feed_end_date),
                eq(
                  projections.maximum_departure_seconds,
                  metadata.maximum_departure_seconds,
                ),
              ),
            );
          if (completed) {
            // Completion is committed with all derived rows. The day PK
            // makes matching count and endpoints proof of exact coverage,
            // including zero-trip days, without scanning departure rows.
            const [coverage] = await build
              .select({
                complete: sql<boolean>`
                  count(*) = (${source.range.endDate}::date - ${source.range.startDate}::date + 1)
                  and min(${days.service_date}) = ${source.range.startDate}::date
                  and max(${days.service_date}) = ${source.range.endDate}::date
                `,
              })
              .from(days)
              .where(eq(days.projection_id, completed.id));
            if (coverage.complete) return completed;
          }
        }
        const [projection] = await build
          .insert(projections)
          .values(metadata)
          .onConflictDoUpdate({
            target: [
              projections.manifest_sha256,
              projections.projector_version,
            ],
            set: metadata,
          })
          .returning({ id: projections.id });
        await build.delete(days).where(eq(days.projection_id, projection.id));
        for (const date of source.dates) {
          const projection_id = projection.id;
          await build.insert(days).values({ ...date.day, projection_id });
          for (let index = 0; index < date.scopes.length; index += batchSize) {
            await build.insert(scopes).values(
              date.scopes.slice(index, index + batchSize).map((scope) => ({
                ...scope,
                projection_id,
              })),
            );
          }
          if ('combined' in date) {
            let batch: (typeof combinedOccurrences.$inferInsert)[] = [];
            let memberships: (typeof combinedMemberships.$inferInsert)[] = [];
            async function flush() {
              if (batch.length) {
                await build.insert(combinedOccurrences).values(batch);
                batch = [];
              }
              for (
                let index = 0;
                index < memberships.length;
                index += batchSize
              ) {
                await build
                  .insert(combinedMemberships)
                  .values(memberships.slice(index, index + batchSize));
              }
              memberships = [];
            }
            for (const row of date.occurrences) {
              batch.push({ ...row.occurrence, projection_id });
              for (const member of row.memberships) {
                memberships.push({ ...member, projection_id });
              }
              if (batch.length === batchSize) await flush();
            }
            await flush();
          } else {
            let batch: (typeof occurrences.$inferInsert)[] = [];
            for (const occurrence of date.occurrences) {
              batch.push({ ...occurrence, projection_id });
              if (batch.length === batchSize) {
                await build.insert(occurrences).values(batch);
                batch = [];
              }
            }
            if (batch.length) await build.insert(occurrences).values(batch);
          }
        }
        await build
          .update(projections)
          .set({ completed_at: sql`clock_timestamp()` })
          .where(identity);
        return projection;
      });
      return { projection };
    } catch (error) {
      // The savepoint rolled back partial writes. Commit invalidation so an
      // unsuccessful verification or rebuild cannot expose stale completion.
      await tx.update(projections).set({ completed_at: null }).where(identity);
      return { error };
    }
  });
  if ('error' in result) {
    throw result.error;
  }
  return result.projection;
}

type Retained = typeof timetables.$inferSelect;

function maximumDepartureSeconds(
  trips: readonly {
    stopTimes: readonly { departureSeconds: number | null }[];
  }[],
) {
  let maximum = 0;
  for (const trip of trips) {
    for (const stop of trip.stopTimes) {
      maximum = Math.max(maximum, stop.departureSeconds ?? 0);
    }
  }
  return maximum;
}

async function legacyProjectionSource(
  retained: Retained,
  { manifestSha256, canonicalDataDir }: ProjectionOptions,
) {
  const {
    notice_bytes,
    mapping_draft_bytes,
    mapping_approval_bytes,
    release_review_bytes,
  } = retained;
  if (
    retained.combined_release !== null ||
    !notice_bytes ||
    !mapping_draft_bytes ||
    !mapping_approval_bytes ||
    !release_review_bytes
  ) {
    throw new Error(
      'Legacy departure projector requires a legacy timetable bundle',
    );
  }
  const entry = ScheduledTimetablePagesEntrySchema.parse(retained.pages_entry);
  if (entry.manifestSha256 !== manifestSha256) {
    throw new Error('Retained Pages entry disagrees with manifest identity');
  }
  const files: Record<string, Uint8Array> = {
    'scheduled-timetable/manifest.json': retained.manifest_bytes,
    'scheduled-timetable/timetable.json': retained.timetable_bytes,
    'scheduled-timetable/NOTICE.txt': notice_bytes,
    'scheduled-timetable/release.json': retained.release_bytes,
    'scheduled-timetable/mapping-draft.json': mapping_draft_bytes,
    'scheduled-timetable/mapping-approval.json': mapping_approval_bytes,
    'scheduled-timetable/release-review.json': release_review_bytes,
  };
  // Shared bundle and canonical validators each decode this selected
  // version; no historical timetable bodies are fetched or decoded.
  await readScheduledTimetablePagesBundle(entry, (path) => files[path]);
  const { manifest, timetable, topology } =
    await verifyScheduledTimetableForCanonicalData(
      retained.manifest_bytes,
      manifestSha256,
      {
        timetableBytes: retained.timetable_bytes,
        noticeBytes: notice_bytes,
      },
      { dataDir: canonicalDataDir },
    );
  const canonical = await readScheduleTopology(canonicalDataDir);
  if (hashBytes(Buffer.from(JSON.stringify(canonical))) !== topology.sha256) {
    throw new Error('Canonical snapshot changed during projection');
  }
  return {
    topology,
    range: manifest.feedRange,
    maximumDepartureSeconds: maximumDepartureSeconds(timetable.timetable.trips),
    dates: scheduledDepartureRows(timetable, canonical, manifest.feedRange),
  };
}

async function combinedProjectionSource(
  retained: Retained,
  { manifestSha256, canonicalDataDir }: ProjectionOptions,
) {
  if (retained.combined_release === null) {
    throw new Error(
      'Combined departure projector requires a combined timetable bundle',
    );
  }
  const canonical = await readScheduleTopology(canonicalDataDir);
  const { artifact, manifest } = verifyRetainedCombinedTimetable(
    manifestSha256,
    retained.combined_release,
    {
      manifestBytes: retained.manifest_bytes,
      timetableBytes: retained.timetable_bytes,
      releaseBytes: retained.release_bytes,
    },
    canonical,
  );
  return {
    topology: manifest.identity.source.topology,
    range: combinedServiceDateRange(
      artifact.applicabilityPolicy.serviceDateRange,
    ),
    maximumDepartureSeconds: maximumDepartureSeconds(artifact.trips),
    dates: combinedDepartureRows(artifact, canonical),
  };
}
