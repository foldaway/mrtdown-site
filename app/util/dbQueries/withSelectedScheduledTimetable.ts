import {
  hashBytes,
  type readScheduleTopology,
  ScheduledTimetableRequestScopeSchema,
  type ScheduledTimetableRollbackAssessment,
  type ScheduledTimetableRollbackOptions,
  ScheduledTimetableRollbackOptionsSchema,
  type ScheduledTimetableSelectionAttempt,
} from '@mrtdown/fs';
import { and, eq, inArray } from 'drizzle-orm';
import z from 'zod';
import type { getDb } from '~/db';
import {
  scheduledDepartureDaysTable as days,
  scheduledDepartureProjectionsTable as projections,
  scheduledDepartureScopesTable as scopes,
} from '~/db/scheduledDepartures.schema';
import { scheduledTimetablesTable as timetables } from '~/db/scheduledTimetables.schema';
import { assessIndexedTimetableRollback } from './assessIndexedTimetableRollback';
import {
  COMBINED_DEPARTURE_PROJECTOR_VERSION,
  SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
} from './projectScheduledTimetable';
import { readLiveScheduleTopology } from './readLiveScheduleTopology';
import {
  scheduledTimetableHistoryColumns,
  validateScheduledTimetableHistory,
} from './scheduledTimetableHistory';

type Database = ReturnType<typeof getDb>;
export type ReadTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];
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
  } | null;
  attempts: Attempt[];
  rollback: ScheduledTimetableRollbackAssessment | null;
};
export type ScheduledTimetableSnapshotOptions<
  Scope extends IndexedTimetableScope = ExactTimetableScope,
> = {
  scope: Scope;
  // Trusted operator review and explicit selection clock; never passenger input.
  rollback?: ScheduledTimetableRollbackOptions;
  // Trusted internal override for tests; never bind this to passenger input.
  readCanonicalTopology?: (tx: ReadTransaction) => Promise<Topology>;
};

export class InvalidStationArrivalScopeError extends Error {}

export function indexedServiceIds(scope: IndexedTimetableScope) {
  return scope.serviceId === undefined ? scope.serviceIds : [scope.serviceId];
}

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
}

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
  use: (
    tx: ReadTransaction,
    snapshot: {
      scope: Scope;
      topology: Topology;
      maximumDepartureSeconds: number;
      unavailableProjections: {
        manifestSha256: string;
        reason: Attempt['reason'];
      }[];
      select: (
        serviceDate: string,
      ) => Promise<ScheduledTimetableSelection<Scope>>;
    },
  ) => Promise<T>,
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
      const topology = structuredClone(
        await (options.readCanonicalTopology ?? readLiveScheduleTopology)(tx),
      );
      z.number().int().positive().parse(topology.projectionVersion);
      validateScope(scope, topology);
      const fingerprint = hashBytes(Buffer.from(JSON.stringify(topology)));
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
      const byIdentity = new Map(
        indexed.map((row) => [
          `${row.manifestSha256}:${row.projectorVersion}`,
          row,
        ]),
      );
      const projectionFor = (version: Version) =>
        byIdentity.get(
          `${version.manifestSha256}:${
            version.format === 'combined'
              ? COMBINED_DEPARTURE_PROJECTOR_VERSION
              : SCHEDULED_DEPARTURE_PROJECTOR_VERSION
          }`,
        );
      const projectionReason = (
        version: Version,
      ): Attempt['reason'] | undefined => {
        const { manifest, serviceDateRange } = version;
        const projection = projectionFor(version);
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
          projection.startDate !== serviceDateRange.startDate ||
          projection.endDate !== serviceDateRange.endDate
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
            projectionFor(version)?.maximumDepartureSeconds ?? 0,
          );
        }
      }
      const selectEligible = async (
        input: string,
        versions: readonly Version[],
      ): Promise<ScheduledTimetableSelection<Scope>> => {
        const serviceDate = z.iso.date().parse(input);
        const coverageRows = await tx
          .select({
            projectionId: days.projection_id,
            serviceDate: days.service_date,
            activeTripCount: days.active_trip_count,
            unassignedActiveTripCount: days.unassigned_active_trip_count,
            serviceId: scopes.service_id,
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
              eq(scopes.destination_station_id, scope.destinationStationId),
            ),
          )
          .where(eq(days.service_date, serviceDate));
        const byProjection = new Map<number, (typeof coverageRows)[number][]>();
        for (const row of coverageRows) {
          const group = byProjection.get(row.projectionId);
          if (group) group.push(row);
          else byProjection.set(row.projectionId, [row]);
        }
        const selection: ScheduledTimetableSelection<Scope> = {
          serviceDate,
          scope,
          selected: null,
          attempts: [],
          rollback: null,
        };
        // Only the validated receipt chain establishes newest-to-oldest order.
        for (const version of [...versions].reverse()) {
          const { serviceDateRange, manifestSha256 } = version;
          const projection = projectionFor(version);
          const rows = projection && byProjection.get(projection.id);
          const coveredScopes = rows?.filter(
            (row) =>
              row.platformIds !== null &&
              (scope.platformId === undefined ||
                row.platformIds.includes(scope.platformId)),
          );
          const unavailable = projectionReason(version);
          let reason: Attempt['reason'];
          let coverage: Coverage | undefined;
          if (
            serviceDate < serviceDateRange.startDate ||
            serviceDate > serviceDateRange.endDate
          ) {
            reason = 'outside-feed-range';
          } else if (unavailable) {
            reason = unavailable;
          } else if (!projection || projection.completedAt === null) {
            throw new Error('Eligible projection metadata is missing');
          } else if (!rows?.length) {
            reason = 'day-not-indexed';
          } else if (coveredScopes?.length !== serviceIds.length) {
            reason = 'scope-not-covered';
          } else {
            coverage = {
              activeTripCount: rows[0].activeTripCount,
              unassignedActiveTripCount: rows[0].unassignedActiveTripCount,
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
                  platformIds: [
                    ...new Set(
                      coveredScopes.flatMap((row) => row.platformIds ?? []),
                    ),
                  ].sort(),
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
      ): Promise<ScheduledTimetableSelection<Scope>> => {
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
