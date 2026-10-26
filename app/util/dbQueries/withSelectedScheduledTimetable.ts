import {
  hashBytes,
  type readScheduleTopology,
  type ScheduledTimetableRequestScope,
  ScheduledTimetableRequestScopeSchema,
  type ScheduledTimetableSelectionAttempt,
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
import { SCHEDULED_DEPARTURE_PROJECTOR_VERSION } from './projectScheduledTimetable';
import { validateScheduledTimetableHistory } from './scheduledTimetableHistory';

type Database = ReturnType<typeof getDb>;
type ReadTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Topology = Awaited<ReturnType<typeof readScheduleTopology>>;
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
type Selection = {
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
};
type SelectionOptions = {
  serviceDate: string;
  scope: ScheduledTimetableRequestScope;
  readCanonicalTopology: (tx: ReadTransaction) => Promise<Topology>;
};

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
    throw new Error(
      'Timetable request references an unknown canonical station, line or service',
    );
  }
  if (service.lineId !== line.id || !line.serviceIds.includes(service.id)) {
    throw new Error('Timetable request service does not belong to its line');
  }
  if (
    !service.revisions.some(
      (revision) =>
        revision.stations.some(({ stationId }) => stationId === station.id) &&
        revision.stations.some(({ stationId }) => stationId === destination.id),
    )
  ) {
    throw new Error('Timetable request stations do not belong to its service');
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
      throw new Error(
        'Timetable request platform does not belong to its station, line and service',
      );
    }
  }
}

/**
 * Private server helper, not a serving-approval gate. The trusted internal caller
 * must load independently established current canonical topology through tx (or
 * an immutable snapshot proven to represent that same DB snapshot). Never derive
 * it from a candidate manifest or accept an externally supplied fingerprint.
 *
 * Consume the selection and perform any subsequent indexed reads inside use;
 * projection IDs returned after this transaction closes are provenance only.
 * Repeatable read keeps canonical reads, history and rebuilt rows consistent.
 */
export async function withSelectedScheduledTimetable<T>(
  db: Database,
  options: SelectionOptions,
  use: (tx: ReadTransaction, selection: Selection) => Promise<T>,
): Promise<T> {
  const serviceDate = z.iso.date().parse(options.serviceDate);
  const scope = ScheduledTimetableRequestScopeSchema.parse(options.scope);
  return db.transaction(
    async (tx) => {
      const topology = structuredClone(await options.readCanonicalTopology(tx));
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
          serviceDate: days.service_date,
          activeTripCount: days.active_trip_count,
          unassignedActiveTripCount: days.unassigned_active_trip_count,
          platformIds: scopes.platform_ids,
        })
        .from(projections)
        .leftJoin(
          days,
          and(
            eq(days.projection_id, projections.id),
            eq(days.service_date, serviceDate),
          ),
        )
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
        .where(
          eq(
            projections.projector_version,
            SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
          ),
        );
      const byManifest = new Map(
        indexed.map((row) => [row.manifestSha256, row]),
      );
      const selection: Selection = {
        serviceDate,
        scope,
        selected: null,
        attempts: [],
      };
      // Only the validated receipt chain establishes newest-to-oldest order.
      for (const version of [...history].reverse()) {
        const { manifest, manifestSha256 } = version;
        const projection = byManifest.get(manifestSha256);
        let reason: Attempt['reason'];
        let coverage: Coverage | undefined;
        if (
          serviceDate < manifest.feedRange.startDate ||
          serviceDate > manifest.feedRange.endDate
        ) {
          reason = 'outside-feed-range';
        } else if (
          manifest.identity.topology.sha256 !== fingerprint ||
          manifest.identity.topology.projectionVersion !==
            topology.projectionVersion
        ) {
          reason = 'topology-mismatch';
        } else if (!projection) {
          reason = 'projection-unavailable';
        } else if (projection.completedAt === null) {
          reason = 'projection-incomplete';
        } else if (
          projection.topologySha256 !== fingerprint ||
          projection.topologyProjectionVersion !== topology.projectionVersion
        ) {
          reason = 'topology-mismatch';
        } else if (
          projection.startDate !== manifest.feedRange.startDate ||
          projection.endDate !== manifest.feedRange.endDate
        ) {
          reason = 'projection-metadata-mismatch';
        } else if (
          projection.serviceDate === null ||
          projection.activeTripCount === null ||
          projection.unassignedActiveTripCount === null
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
              coverage: { ...coverage, platformIds: projection.platformIds },
            };
          }
        }
        selection.attempts.push({ manifestSha256, reason, ...coverage });
        if (selection.selected) {
          break;
        }
      }
      return use(tx, selection);
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
