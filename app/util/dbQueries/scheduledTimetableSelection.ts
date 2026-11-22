import { hashBytes, type ScheduledTimetableRollbackOptions } from '@mrtdown/fs';
import z from 'zod';
import { assessIndexedTimetableRollback } from './assessIndexedTimetableRollback';
import {
  COMBINED_DEPARTURE_PROJECTOR_VERSION,
  SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
} from './projectScheduledTimetable';
import type { validateScheduledTimetableHistory } from './scheduledTimetableHistory';
import type {
  IndexedTimetableScope,
  ScheduledTimetableSelection,
  Topology,
} from './withSelectedScheduledTimetable';

type Version = ReturnType<typeof validateScheduledTimetableHistory>[number];
type Attempt = ScheduledTimetableSelection['attempts'][number];

export type TimetableProjection = {
  id: number;
  manifestSha256: string;
  projectorVersion: number;
  topologySha256: string;
  topologyProjectionVersion: number;
  startDate: string;
  endDate: string;
  maximumDepartureSeconds: number;
  completedAt: string | null;
};

export type TimetableCoverageRow = {
  projectionId: number;
  serviceDate: string;
  activeTripCount: number;
  unassignedActiveTripCount: number;
  serviceId: string | null;
  destinationId: string | null;
  platformIds: string[] | null;
};

type Coverage = Pick<
  TimetableCoverageRow,
  'activeTripCount' | 'unassignedActiveTripCount'
>;

type SelectionInputs<Scope extends IndexedTimetableScope> = {
  scope: Scope;
  topology: Topology;
  history: readonly Version[];
  indexed: readonly TimetableProjection[];
  loop?: true;
  loopRevisions: (Topology['services'][number]['revisions'] | undefined)[];
  rollback?: ScheduledTimetableRollbackOptions;
};

export function indexedServiceIds(scope: IndexedTimetableScope) {
  return scope.serviceId === undefined ? scope.serviceIds : [scope.serviceId];
}

/** Coverage rows must belong to the validated request scope and selected date. */
export function createTimetableSelectionPolicy<
  Scope extends IndexedTimetableScope,
>({
  scope,
  topology,
  history,
  indexed,
  loop,
  loopRevisions,
  rollback,
}: SelectionInputs<Scope>) {
  const serviceIds = indexedServiceIds(scope);
  const fingerprint = hashBytes(Buffer.from(JSON.stringify(topology)));
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

  const selectEligible = (
    input: string,
    versions: readonly Version[],
    coverageRows: readonly TimetableCoverageRow[],
  ): ScheduledTimetableSelection<Scope> => {
    const serviceDate = z.iso.date().parse(input);
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
    const loopActive = loopRevisions.every((revisions) =>
      revisions?.some(
        ({ startAt, endAt }) =>
          startAt <= serviceDate && (endAt == null || serviceDate < endAt),
      ),
    );
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
      } else if (
        !loopActive ||
        !coveredScopes ||
        new Set(coveredScopes.map(({ serviceId }) => serviceId)).size !==
          serviceIds.length
      ) {
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
            ...(loop && {
              loopDestinationIds: [
                ...new Set(
                  coveredScopes.flatMap(({ destinationId }) =>
                    destinationId === null ? [] : [destinationId],
                  ),
                ),
              ],
            }),
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

  const select = (
    serviceDate: string,
    coverageRows: readonly TimetableCoverageRow[],
  ): ScheduledTimetableSelection<Scope> => {
    const normal = selectEligible(serviceDate, history, coverageRows);
    // Exact-destination rollback reviews do not apply to loop-wide reads.
    if (!rollback || loop) {
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
    const overridden = selectEligible(
      serviceDate,
      history.filter(
        (version) =>
          version.manifestSha256 === rollback.review.to.manifestSha256,
      ),
      coverageRows,
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
  return {
    projectionFor,
    projectionReason,
    maximumDepartureSeconds,
    unavailableProjections,
    select,
  };
}
