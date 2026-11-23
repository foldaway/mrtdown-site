import {
  type readScheduleTopology,
  ScheduledTimetableRequestScopeSchema,
  type ScheduledTimetableRollbackAssessment,
  type ScheduledTimetableRollbackOptions,
  ScheduledTimetableRollbackOptionsSchema,
  type ScheduledTimetableSelectionAttempt,
} from '@mrtdown/fs';
import { and, arrayContains, countDistinct, eq, inArray } from 'drizzle-orm';
import z from 'zod';
import type { getDb } from '~/db';
import {
  scheduledDepartureDaysTable as days,
  scheduledDepartureProjectionsTable as projections,
  scheduledDepartureScopesTable as scopes,
} from '~/db/scheduledDepartures.schema';
import { scheduledTimetablesTable as timetables } from '~/db/scheduledTimetables.schema';
import { isLoopPath } from '~/util/stationArrivalBranches';
import type { AppDbTransaction } from './database';
import {
  COMBINED_DEPARTURE_PROJECTOR_VERSION,
  SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
} from './projectScheduledTimetable';
import {
  scheduledTimetableHistoryColumns,
  validateScheduledTimetableHistory,
} from './scheduledTimetableHistory';
import { readScheduleTopologyForSnapshot } from './scheduleTopologyCache';
import {
  createTimetableSelectionPolicy,
  indexedServiceIds,
} from './scheduledTimetableSelection';

type Database = ReturnType<typeof getDb>;
export type ReadTransaction = AppDbTransaction;
export type Topology = Awaited<ReturnType<typeof readScheduleTopology>>;
type Version = ReturnType<typeof validateScheduledTimetableHistory>[number];
export type IndexedTimetableScope = z.infer<
  typeof ScheduledTimetableRequestScopeSchema
>;
export type ExactTimetableScope = Extract<
  IndexedTimetableScope,
  { serviceId: string }
>;
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
export type ScheduledTimetableSelection<
  Scope extends IndexedTimetableScope = ExactTimetableScope,
> = {
  serviceDate: string;
  scope: Scope;
  selected: {
    projectionId: number;
    projectorVersion: number;
    topology: { sha256: string; projectionVersion: number };
    maximumDepartureSeconds: number;
    completedAt: string;
    version: Version;
    coverage: Coverage & { platformIds: string[] };
    loopDestinationIds?: string[];
  } | null;
  attempts: Attempt[];
  rollback: ScheduledTimetableRollbackAssessment | null;
};
export type ScheduledTimetableSnapshotOptions<
  Scope extends IndexedTimetableScope = ExactTimetableScope,
> = {
  scope: Scope;
  loop?: true;
  // Trusted operator review and explicit selection clock; never passenger input.
  rollback?: ScheduledTimetableRollbackOptions;
  // Trusted internal override for tests; never bind this to passenger input.
  readCanonicalTopology?: (tx: ReadTransaction) => Promise<Topology>;
};

export class InvalidStationArrivalScopeError extends Error {}

export { indexedServiceIds } from './scheduledTimetableSelection';

// The shared selector does not export its canonical request validation.
function validateScope(scope: IndexedTimetableScope, topology: Topology) {
  const line = topology.lines.find(({ id }) => id === scope.lineId);
  const station = topology.stations.find(({ id }) => id === scope.stationId);
  const destination = topology.stations.find(
    ({ id }) => id === scope.destinationStationId,
  );
  if (!line || !station || !destination) {
    throw new InvalidStationArrivalScopeError(
      'Timetable request references an unknown canonical station, line or service',
    );
  }
  for (const serviceId of indexedServiceIds(scope)) {
    const service = topology.services.find(({ id }) => id === serviceId);
    if (!service) {
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
          revision.stations.some(
            ({ stationId }) => stationId === destination.id,
          ),
      )
    ) {
      throw new InvalidStationArrivalScopeError(
        'Timetable request stations do not belong to its service',
      );
    }
  }
  if (scope.platformId === undefined) return true;
  const platforms = station.platforms.filter(
    ({ id }) => id === scope.platformId,
  );
  if (platforms.length !== 1 || platforms[0].lineId !== line.id) {
    throw new InvalidStationArrivalScopeError(
      'Timetable request platform does not belong to its station and line',
    );
  }
  const { serviceIds } = platforms[0];
  return (
    !serviceIds.length ||
    indexedServiceIds(scope).every((id) => serviceIds.includes(id))
  );
}

/** Canonical scope checks are identical for SQL and published inputs. */
export function validateTimetableScope(
  scope: IndexedTimetableScope,
  topology: Topology,
  loop?: true,
) {
  const serviceIds = indexedServiceIds(scope);
  const matchesPlatformDefaults = validateScope(scope, topology);
  const loopRevisions = loop
    ? serviceIds.map((serviceId) =>
        topology.services
          .find(({ id }) => id === serviceId)
          ?.revisions.filter(
            ({ stations }) =>
              isLoopPath(stations, scope.destinationStationId) &&
              stations
                .slice(0, -1)
                .some(({ stationId }) => stationId === scope.stationId),
          ),
      )
    : [];
  if (loopRevisions.some((revisions) => !revisions?.length)) {
    throw new InvalidStationArrivalScopeError(
      'Loop timetable requests require a canonical loop and its anchor',
    );
  }
  return { matchesPlatformDefaults, loopRevisions };
}

export type TimetableSnapshot<Scope extends IndexedTimetableScope> = {
  scope: Scope;
  topology: Topology;
  maximumDepartureSeconds: number;
  unavailableProjections: {
    manifestSha256: string;
    reason: Attempt['reason'];
  }[];
  select: (serviceDate: string) => Promise<ScheduledTimetableSelection<Scope>>;
};

/**
 * One read-only snapshot for selection and all consumer reads. The trusted
 * default loader reconstructs live topology through tx after completed promotion.
 * An internal override must establish that same state, never a candidate/external hash.
 * Consume projection IDs within use; afterward they are provenance only.
 */
export async function withScheduledTimetableSnapshot<
  Scope extends IndexedTimetableScope,
  T,
>(
  db: Database,
  options: ScheduledTimetableSnapshotOptions<Scope>,
  use: (tx: ReadTransaction, snapshot: TimetableSnapshot<Scope>) => Promise<T>,
): Promise<T> {
  // Parsing preserves the exact-service or service-set variant.
  const scope = ScheduledTimetableRequestScopeSchema.parse(
    options.scope,
  ) as Scope;
  const serviceIds = indexedServiceIds(scope);
  const rollback = ScheduledTimetableRollbackOptionsSchema.optional().parse(
    options.rollback,
  );
  return db.transaction(
    async (tx) => {
      const topology = options.readCanonicalTopology
        ? structuredClone(await options.readCanonicalTopology(tx))
        : await readScheduleTopologyForSnapshot(db, tx);
      z.number().int().positive().parse(topology.projectionVersion);
      const { matchesPlatformDefaults, loopRevisions } = validateTimetableScope(
        scope,
        topology,
        options.loop,
      );
      const destinationFilter = options.loop
        ? undefined
        : eq(scopes.destination_station_id, scope.destinationStationId);
      // Check the full source chain before considering derived projections.
      const history = validateScheduledTimetableHistory(
        await tx.select(scheduledTimetableHistoryColumns).from(timetables),
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
          inArray(projections.projector_version, [
            SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
            COMBINED_DEPARTURE_PROJECTOR_VERSION,
          ]),
        );
      const policy = createTimetableSelectionPolicy({
        scope,
        topology,
        history,
        indexed,
        loop: options.loop,
        loopRevisions,
        rollback,
      });
      const {
        projectionFor,
        projectionReason,
        maximumDepartureSeconds,
        unavailableProjections,
      } = policy;
      // A combined projection can establish an explicitly reviewed service/platform scope.
      if (!matchesPlatformDefaults && scope.platformId !== undefined) {
        const combinedProjectionIds = history.flatMap((version) => {
          const projection = projectionFor(version);
          return version.format === 'combined' &&
            projection &&
            !projectionReason(version)
            ? [projection.id]
            : [];
        });
        const [covered] = combinedProjectionIds.length
          ? await tx
              .select({ projectionId: scopes.projection_id })
              .from(scopes)
              .where(
                and(
                  inArray(scopes.projection_id, combinedProjectionIds),
                  eq(scopes.station_id, scope.stationId),
                  eq(scopes.line_id, scope.lineId),
                  destinationFilter,
                  inArray(scopes.service_id, serviceIds),
                  arrayContains(scopes.platform_ids, [scope.platformId]),
                ),
              )
              .groupBy(scopes.projection_id, scopes.service_date)
              .having(eq(countDistinct(scopes.service_id), serviceIds.length))
              .limit(1)
          : [];
        if (!covered) {
          throw new InvalidStationArrivalScopeError(
            'Timetable request platform does not belong to its station, line and service',
          );
        }
      }
      const select = async (serviceDate: string) => {
        const validatedDate = z.iso.date().parse(serviceDate);
        const coverageRows = await tx
          .select({
            projectionId: days.projection_id,
            serviceDate: days.service_date,
            activeTripCount: days.active_trip_count,
            unassignedActiveTripCount: days.unassigned_active_trip_count,
            serviceId: scopes.service_id,
            destinationId: scopes.destination_station_id,
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
              inArray(scopes.service_id, serviceIds),
              destinationFilter,
            ),
          )
          .where(eq(days.service_date, validatedDate));
        return policy.select(validatedDate, coverageRows);
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
export async function withSelectedScheduledTimetable<
  Scope extends IndexedTimetableScope,
  T,
>(
  db: Database,
  options: ScheduledTimetableSnapshotOptions<Scope> & { serviceDate: string },
  use: (
    tx: ReadTransaction,
    selection: ScheduledTimetableSelection<Scope>,
  ) => Promise<T>,
): Promise<T> {
  const serviceDate = z.iso.date().parse(options.serviceDate);
  return withScheduledTimetableSnapshot(db, options, async (tx, snapshot) =>
    use(tx, await snapshot.select(serviceDate)),
  );
}
