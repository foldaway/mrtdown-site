import type { Station } from '@mrtdown/core';
import type { ScheduledTimetableSelection } from './dbQueries/withSelectedScheduledTimetable';
import type { StationArrivalSourceDecision } from './stationArrivalSourcePolicy';

export const STATION_ARRIVALS_V2_LIMIT = 20;
export const STATION_ARRIVALS_V2_HORIZON_MINUTES = 60;

type CoverageReason = ScheduledTimetableSelection['attempts'][number]['reason'];
type Rollback = NonNullable<ScheduledTimetableSelection['rollback']>;
type SourceIdentity = { manifestSha256: string; snapshotSha256: string };
type ArrivalDisplay = {
  serviceName: Station['name'];
  destinationCode: string;
  destinationName: Station['name'] | null;
};
type ScheduledDeparture = SourceIdentity & {
  time: string;
  basis: 'scheduled';
  precision: 'exact' | 'approximate';
  serviceDate: string;
  providerTripId: string;
  providerStopId: string;
  stopSequence: string;
  revisionId: string;
};

export type StationArrivalsV2 = {
  schemaVersion: 2;
  scope: {
    stationId: string;
    lineId: string;
    serviceId: string;
    destinationStationId: string;
    platformId?: string;
  };
  window: {
    startInstant: string;
    endInstant: string;
    limit: typeof STATION_ARRIVALS_V2_LIMIT;
  };
  coverage: {
    complete: boolean;
    untimedDepartureCount: number;
    serviceDays: {
      serviceDate: string;
      source: SourceIdentity | null;
      reasons: CoverageReason[];
      rollback: { status: Rollback['status']; blockers: string[] } | null;
    }[];
    unavailableReasons: CoverageReason[];
  };
} & (
  | {
      source: 'scheduled';
      reason: 'complete' | 'incomplete';
      timings: (ArrivalDisplay & {
        platforms: { id: string; label: string }[];
        departures: ScheduledDeparture[];
      })[];
    }
  | {
      source: 'unavailable';
      reason: 'timetable-unavailable';
    }
);

/** Public allowlist: never serialize the private decision or spread its records. */
export function serializeStationArrivalsV2(
  decision: StationArrivalSourceDecision,
): StationArrivalsV2 {
  const { scheduled } = decision;
  const { scope, window } = scheduled;
  const common: Pick<
    StationArrivalsV2,
    'schemaVersion' | 'scope' | 'window' | 'coverage'
  > = {
    schemaVersion: 2,
    scope: {
      stationId: scope.stationId,
      lineId: scope.lineId,
      serviceId: scope.serviceId,
      destinationStationId: scope.destinationStationId,
      ...(scope.platformId === undefined
        ? {}
        : { platformId: scope.platformId }),
    },
    window: {
      startInstant: window.startInstant,
      endInstant: window.endInstant,
      limit: STATION_ARRIVALS_V2_LIMIT,
    },
    coverage: {
      complete: scheduled.complete,
      untimedDepartureCount: scheduled.untimedDepartureCount,
      serviceDays: scheduled.serviceDays.map((day) => ({
        serviceDate: day.serviceDate,
        source: day.selected
          ? {
              manifestSha256: day.selected.version.manifestSha256,
              snapshotSha256: day.selected.version.manifest.capture.sha256,
            }
          : null,
        reasons: [...new Set(day.attempts.map(({ reason }) => reason))],
        rollback: day.rollback
          ? {
              status: day.rollback.status,
              blockers: [...day.rollback.blockers],
            }
          : null,
      })),
      unavailableReasons: [
        ...new Set(
          scheduled.unavailableProjections.map(({ reason }) => reason),
        ),
      ],
    },
  };
  switch (decision.source) {
    case 'scheduled':
      return {
        ...common,
        source: 'scheduled',
        reason: decision.reason,
        timings: scheduled.lines.flatMap(({ arrivalTimings }) =>
          arrivalTimings.map((timing) => ({
            serviceName: timing.serviceName,
            destinationName: timing.destinationName,
            destinationCode: timing.destinationCode,
            platforms: timing.platformIds.map((id, index) => ({
              id,
              label: timing.platformLabels[index],
            })),
            departures: timing.departures.map((departure) => ({
              time: departure.time,
              basis: departure.basis,
              precision: departure.precision,
              serviceDate: departure.serviceDate,
              providerTripId: departure.providerTripId,
              providerStopId: departure.providerStopId,
              stopSequence: departure.stopSequence,
              revisionId: departure.revisionId,
              manifestSha256: departure.manifestSha256,
              snapshotSha256: departure.snapshotSha256,
            })),
          })),
        ),
      };
    case 'unavailable':
      return { ...common, source: 'unavailable', reason: decision.reason };
  }
}
