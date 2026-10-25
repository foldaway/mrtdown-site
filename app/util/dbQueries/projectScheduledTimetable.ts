import { ScheduledTimetablePagesEntrySchema } from '@mrtdown/core';
import {
  hashBytes,
  readScheduledTimetablePagesBundle,
  readScheduleTopology,
  verifyScheduledTimetableForCanonicalData,
} from '@mrtdown/fs';
import { and, eq, sql } from 'drizzle-orm';
import type { getDb } from '~/db';
import {
  scheduledDepartureDaysTable as days,
  scheduledDepartureOccurrencesTable as occurrences,
  scheduledDepartureProjectionsTable as projections,
  scheduledDepartureScopesTable as scopes,
} from '~/db/scheduledDepartures.schema';
import { scheduledTimetablesTable as timetables } from '~/db/scheduledTimetables.schema';
import { scheduledDepartureRows } from './scheduledDepartureRows';
import { validateScheduledTimetableHistory } from './scheduledTimetableHistory';

export const SCHEDULED_DEPARTURE_PROJECTOR_VERSION = 1;
const batchSize = 500;

type ProjectionOptions = {
  manifestSha256: string;
  projectorVersion: typeof SCHEDULED_DEPARTURE_PROJECTOR_VERSION;
  canonicalDataDir: string;
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
  const { manifestSha256, projectorVersion, canonicalDataDir } = options;
  if (projectorVersion !== SCHEDULED_DEPARTURE_PROJECTOR_VERSION) {
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
    await tx.update(projections).set({ completed_at: null }).where(identity);
    try {
      const projection = await tx.transaction(async (build) => {
        const history = await build
          .select({
            hash: timetables.manifest_sha256,
            predecessor: timetables.predecessor_sha256,
            receipt: timetables.import_record,
            manifestBytes: timetables.manifest_bytes,
          })
          .from(timetables);
        await validateScheduledTimetableHistory(history);
        const entry = ScheduledTimetablePagesEntrySchema.parse(
          retained.pages_entry,
        );
        if (entry.manifestSha256 !== manifestSha256) {
          throw new Error(
            'Retained Pages entry disagrees with manifest identity',
          );
        }
        const files: Record<string, Uint8Array> = {
          'scheduled-timetable/manifest.json': retained.manifest_bytes,
          'scheduled-timetable/timetable.json': retained.timetable_bytes,
          'scheduled-timetable/NOTICE.txt': retained.notice_bytes,
          'scheduled-timetable/release.json': retained.release_bytes,
          'scheduled-timetable/mapping-draft.json':
            retained.mapping_draft_bytes,
          'scheduled-timetable/mapping-approval.json':
            retained.mapping_approval_bytes,
          'scheduled-timetable/release-review.json':
            retained.release_review_bytes,
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
              noticeBytes: retained.notice_bytes,
            },
            { dataDir: canonicalDataDir },
          );
        const canonical = await readScheduleTopology(canonicalDataDir);
        if (
          hashBytes(Buffer.from(JSON.stringify(canonical))) !== topology.sha256
        ) {
          throw new Error('Canonical snapshot changed during projection');
        }
        let maximumDepartureSeconds = 0;
        for (const trip of timetable.timetable.trips) {
          for (const stop of trip.stopTimes) {
            maximumDepartureSeconds = Math.max(
              maximumDepartureSeconds,
              stop.departureSeconds ?? 0,
            );
          }
        }
        const metadata = {
          manifest_sha256: manifestSha256,
          projector_version: projectorVersion,
          topology_sha256: topology.sha256,
          topology_projection_version: topology.projectionVersion,
          feed_start_date: manifest.feedRange.startDate,
          feed_end_date: manifest.feedRange.endDate,
          maximum_departure_seconds: maximumDepartureSeconds,
          completed_at: null,
        };
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
        let batch: (typeof occurrences.$inferInsert)[] = [];
        for (const date of scheduledDepartureRows(
          timetable,
          canonical,
          manifest.feedRange,
        )) {
          await build
            .insert(days)
            .values({ ...date.day, projection_id: projection.id });
          for (let index = 0; index < date.scopes.length; index += batchSize) {
            await build.insert(scopes).values(
              date.scopes.slice(index, index + batchSize).map((scope) => ({
                ...scope,
                projection_id: projection.id,
              })),
            );
          }
          for (const occurrence of date.occurrences) {
            batch.push({ ...occurrence, projection_id: projection.id });
            if (batch.length === batchSize) {
              await build.insert(occurrences).values(batch);
              batch = [];
            }
          }
        }
        if (batch.length) {
          await build.insert(occurrences).values(batch);
        }
        await build
          .update(projections)
          .set({ completed_at: sql`clock_timestamp()` })
          .where(identity);
        return projection;
      });
      return { projection };
    } catch (error) {
      // Roll back partial materialization to the savepoint, but commit the
      // invalidation so an unsuccessful rebuild cannot expose stale completion.
      return { error };
    }
  });
  if ('error' in result) {
    throw result.error;
  }
  return result.projection;
}
