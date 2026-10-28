import {
  hashBytes,
  type readScheduleTopology,
  type ScheduledTimetableRequestScope,
  ScheduledTimetableRequestScopeSchema,
  type ScheduledTimetableSelectionAttempt,
  type ScheduledTimetableRollbackAssessment,
  type ScheduledTimetableRollbackOptions,
  ScheduledTimetableRollbackOptionsSchema,
} from '@mrtdown/fs';
import { and, eq } from 'drizzle-orm';
import z from 'zod';
import type { getDb } from '~/db';
import {
  scheduledDepartureDaysTable as days,
  scheduledDepartureProjectionsTable as projections,
  scheduledDepartureScopesTable as scopes,
} from '~/db/scheduledDepartures.schema';
import { scheduledTimetablesTable as timetables } from '~/db/scheduledTimetables.schema';
import { assessIndexedTimetableRollback } from './assessIndexedTimetableRollback';
import { SCHEDULED_DEPARTURE_PROJECTOR_VERSION } from './projectScheduledTimetable';
import { readLiveScheduleTopology } from './readLiveScheduleTopology';
import { validateScheduledTimetableHistory } from './scheduledTimetableHistory';

type Database = ReturnType<typeof getDb>;
export type ReadTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];
export type Topology = Awaited<ReturnType<typeof readScheduleTopology>>;
type Version = Awaited<
  ReturnType<typeof validateScheduledTimetableHistory>
>[number];
type Coverage = { activeTripCount: number; unassignedActiveTripCount: number };
type Attempt = Omit<ScheduledTimetableSelectionAttempt, 'reason'> & {
  reason:
    | Exclude<
        ScheduledTimetableSelectionAttempt['reason'],
        'artifact-verification-failed'
      >
    | 'projection-unavailable'
    | 'projection-incomplete'
    | 'projection-metadata-mismatch'
    | 'day-not-indexed';
};
export type ScheduledTimetableSelection = {
  serviceDate: string;
  scope: ScheduledTimetableRequestScope;
  selected: {
    projectionId: number;
    projectorVersion: number;
    topology: { sha256: string; projectionVersion: number };
    maximumDepartureSeconds: number;
    completedAt: string;
    version: Version;
    coverage: Coverage & { platformIds: string[] };
  } | null;
  attempts: Attempt[];
  rollback: ScheduledTimetableRollbackAssessment | null;
};
export type ScheduledTimetableSnapshotOptions = {
  scope: ScheduledTimetableRequestScope;
  // Trusted operator review and explicit selection clock; never passenger input.
  rollback?: ScheduledTimetableRollbackOptions;
  // Trusted internal override for tests; never bind this to passenger input.
  readCanonicalTopology?: (tx: ReadTransaction) => Promise<Topology>;
};

export class InvalidStationArrivalScopeError extends Error {}

// The shared selector does not export its canonical request validation.
function validateScope(
  scope: ScheduledTimetableRequestScope,
  topology: Topology,
) {
  const line = topology.lines.find(({ id }) => id === scope.lineId);
  const service = topology.services.find(({ id }) => id === scope.serviceId);
  const station = topology.stations.find(({ id }) => id === scope.stationId);
  const destination = topology.stations.find(
    ({ id }) => id === scope.destinationStationId,
  );
  if (!line || !service || !station || !destination) {
    throw new InvalidStationArrivalScopeError(
      'Timetable request references an unknown canonical station, line or service',
    );
  }
  if (service.lineId !== line.id || !line.serviceIds.includes(service.id)) {
    throw new InvalidStationArrivalScopeError(
      'Timetable request service does not belong to its line',
    );
  }
  if (
    !service.revisions.some(
      (revision) =>
        revision.stations.some(({ stationId }) => stationId === station.id) &&
        revision.stations.some(({ stationId }) => stationId === destination.id),
    )
  ) {
    throw new InvalidStationArrivalScopeError(
      'Timetable request stations do not belong to its service',
    );
  }
  if (scope.platformId !== undefined) {
    const platforms = station.platforms.filter(
      ({ id }) => id === scope.platformId,
    );
    if (
      platforms.length !== 1 ||
      platforms[0].lineId !== line.id ||
      (platforms[0].serviceIds.length > 0 &&
        !platforms[0].serviceIds.includes(service.id))
    ) {
      throw new InvalidStationArrivalScopeError(
        'Timetable request platform does not belong to its station, line and service',
      );
    }
  }
}

/**
 * One read-only snapshot for selection and all consumer reads. The trusted
 * default loader reconstructs live topology through tx after completed promotion.
 * An internal override must establish that same state, never a candidate/external hash.
 * Consume projection IDs within use; afterward they are provenance only.
 */
export async function withScheduledTimetableSnapshot<T>(
  db: Database,
  options: ScheduledTimetableSnapshotOptions,
  use: (
    tx: ReadTransaction,
    snapshot: {
      scope: ScheduledTimetableRequestScope;
      topology: Topology;
      maximumDepartureSeconds: number;
      unavailableProjections: {
        manifestSha256: string;
        reason: Attempt['reason'];
      }[];
      select: (serviceDate: string) => Promise<ScheduledTimetableSelection>;
    },
  ) => Promise<T>,
): Promise<T> {
  const scope = ScheduledTimetableRequestScopeSchema.parse(options.scope);
  const rollback = ScheduledTimetableRollbackOptionsSchema.optional().parse(
    options.rollback,
  );
  return db.transaction(
    async (tx) => {
      const topology = structuredClone(
        await (options.readCanonicalTopology ?? readLiveScheduleTopology)(tx),
      );
      z.number().int().positive().parse(topology.projectionVersion);
      validateScope(scope, topology);
      const fingerprint = hashBytes(Buffer.from(JSON.stringify(topology)));
      const history = await validateScheduledTimetableHistory(
        await tx
          .select({
            hash: timetables.manifest_sha256,
            predecessor: timetables.predecessor_sha256,
            receipt: timetables.import_record,
            manifestBytes: timetables.manifest_bytes,
          })
          .from(timetables),
      );
      const indexed = await tx
        .select({
          id: projections.id,
          manifestSha256: projections.manifest_sha256,
          projectorVersion: projections.projector_version,
          topologySha256: projections.topology_sha256,
          topologyProjectionVersion: projections.topology_projection_version,
          startDate: projections.feed_start_date,
          endDate: projections.feed_end_date,
          maximumDepartureSeconds: projections.maximum_departure_seconds,
          completedAt: projections.completed_at,
        })
        .from(projections)
        .where(
          eq(
            projections.projector_version,
            SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
          ),
        );
      const byManifest = new Map(
        indexed.map((row) => [row.manifestSha256, row]),
      );
      const projectionReason = (
        version: Version,
      ): Attempt['reason'] | undefined => {
        const { manifest, manifestSha256 } = version;
        const projection = byManifest.get(manifestSha256);
        if (
          manifest.identity.topology.sha256 !== fingerprint ||
          manifest.identity.topology.projectionVersion !==
            topology.projectionVersion
        ) {
          return 'topology-mismatch';
        }
        if (!projection) {
          return 'projection-unavailable';
        }
        if (projection.completedAt === null) {
          return 'projection-incomplete';
        }
        if (
          projection.topologySha256 !== fingerprint ||
          projection.topologyProjectionVersion !== topology.projectionVersion
        ) {
          return 'topology-mismatch';
        }
        if (
          projection.startDate !== manifest.feedRange.startDate ||
          projection.endDate !== manifest.feedRange.endDate
        ) {
          return 'projection-metadata-mismatch';
        }
      };
      let maximumDepartureSeconds = 0;
      const unavailableProjections: {
        manifestSha256: string;
        reason: Attempt['reason'];
      }[] = [];
      for (const version of history) {
        const { manifest, manifestSha256 } = version;
        if (
          manifest.identity.topology.sha256 !== fingerprint ||
          manifest.identity.topology.projectionVersion !==
            topology.projectionVersion
        ) {
          continue;
        }
        const reason = projectionReason(version);
        if (reason) {
          // Unknown source offsets can hide older service dates, even if a fallback is selected.
          unavailableProjections.push({ manifestSha256, reason });
        } else {
          maximumDepartureSeconds = Math.max(
            maximumDepartureSeconds,
            byManifest.get(manifestSha256)?.maximumDepartureSeconds ?? 0,
          );
        }
      }
      const selectEligible = async (
        input: string,
        versions: readonly Version[],
      ): Promise<ScheduledTimetableSelection> => {
        const serviceDate = z.iso.date().parse(input);
        const coverageRows = await tx
          .select({
            projectionId: days.projection_id,
            serviceDate: days.service_date,
            activeTripCount: days.active_trip_count,
            unassignedActiveTripCount: days.unassigned_active_trip_count,
            platformIds: scopes.platform_ids,
          })
          .from(days)
          .leftJoin(
            scopes,
            and(
              eq(scopes.projection_id, days.projection_id),
              eq(scopes.service_date, days.service_date),
              eq(scopes.station_id, scope.stationId),
              eq(scopes.line_id, scope.lineId),
              eq(scopes.service_id, scope.serviceId),
              eq(scopes.destination_station_id, scope.destinationStationId),
            ),
          )
          .where(eq(days.service_date, serviceDate));
        const byProjection = new Map(
          coverageRows.map((row) => [row.projectionId, row]),
        );
        const selection: ScheduledTimetableSelection = {
          serviceDate,
          scope,
          selected: null,
          attempts: [],
          rollback: null,
        };
        // Only the validated receipt chain establishes newest-to-oldest order.
        for (const version of [...versions].reverse()) {
          const { manifest, manifestSha256 } = version;
          const metadata = byManifest.get(manifestSha256);
          const projection = metadata && {
            ...metadata,
            ...byProjection.get(metadata.id),
          };
          const unavailable = projectionReason(version);
          let reason: Attempt['reason'];
          let coverage: Coverage | undefined;
          if (
            serviceDate < manifest.feedRange.startDate ||
            serviceDate > manifest.feedRange.endDate
          ) {
            reason = 'outside-feed-range';
          } else if (unavailable) {
            reason = unavailable;
          } else if (!projection || projection.completedAt === null) {
            throw new Error('Eligible projection metadata is missing');
          } else if (
            projection.serviceDate == null ||
            projection.activeTripCount == null ||
            projection.unassignedActiveTripCount == null
          ) {
            reason = 'day-not-indexed';
          } else if (
            !projection.platformIds ||
            (scope.platformId !== undefined &&
              !projection.platformIds.includes(scope.platformId))
          ) {
            reason = 'scope-not-covered';
          } else {
            coverage = {
              activeTripCount: projection.activeTripCount,
              unassignedActiveTripCount: projection.unassignedActiveTripCount,
            };
            reason =
              coverage.unassignedActiveTripCount > 0
                ? 'mapping-coverage-gap'
                : 'eligible';
            if (reason === 'eligible') {
              selection.selected = {
                projectionId: projection.id,
                projectorVersion: projection.projectorVersion,
                topology: {
                  sha256: fingerprint,
                  projectionVersion: topology.projectionVersion,
                },
                maximumDepartureSeconds: projection.maximumDepartureSeconds,
                completedAt: projection.completedAt,
                version,
                coverage: {
                  ...coverage,
                  platformIds: projection.platformIds,
                },
              };
            }
          }
          selection.attempts.push({ manifestSha256, reason, ...coverage });
          if (selection.selected) {
            break;
          }
        }
        return selection;
      };
      const select = async (
        serviceDate: string,
      ): Promise<ScheduledTimetableSelection> => {
        const normal = await selectEligible(serviceDate, history);
        if (!rollback) {
          return normal;
        }
        const assessment = assessIndexedTimetableRollback(
          rollback,
          normal,
          history,
        );
        if (assessment.status === 'not-applicable') {
          return { ...normal, rollback: assessment };
        }
        if (assessment.status === 'rejected') {
          return { ...normal, selected: null, rollback: assessment };
        }
        // Reuse every normal eligibility check, restricted to the exact reviewed target.
        const overridden = await selectEligible(
          serviceDate,
          history.filter(
            (version) =>
              version.manifestSha256 === rollback.review.to.manifestSha256,
          ),
        );
        return {
          ...overridden,
          attempts: [...normal.attempts, ...overridden.attempts],
          rollback: overridden.selected
            ? assessment
            : {
                ...assessment,
                status: 'rejected',
                blockers: ['rollback-target-is-not-eligible'],
              },
        };
      };
      return use(tx, {
        scope,
        topology,
        maximumDepartureSeconds,
        unavailableProjections,
        select,
      });
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

/**
 * Private server helper, not a serving-approval gate. Uses live normalized topology
 * by default. Internal overrides must independently establish the same DB snapshot,
 * never derive topology from a candidate or accept an external fingerprint.
 * Consume projection IDs inside use; after the snapshot closes they are provenance only.
 */
export async function withSelectedScheduledTimetable<T>(
  db: Database,
  options: ScheduledTimetableSnapshotOptions & { serviceDate: string },
  use: (
    tx: ReadTransaction,
    selection: ScheduledTimetableSelection,
  ) => Promise<T>,
): Promise<T> {
  const serviceDate = z.iso.date().parse(options.serviceDate);
  return withScheduledTimetableSnapshot(db, options, async (tx, snapshot) =>
    use(tx, await snapshot.select(serviceDate)),
  );
}
