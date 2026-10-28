import { Temporal } from '@js-temporal/polyfill';
import type { buildStationArrivalLines } from './dbQueries/stationArrivals';
import type { ScheduledStationArrivals } from './scheduledStationArrivals';

type FrequencyTiming = Awaited<
  ReturnType<typeof buildStationArrivalLines>
>[number]['arrivalTimings'][number];

/** Caller supplies an independently covered canonical branch and query window. */
export type FrequencyArrivalCandidate = {
  stationId: string;
  window: ScheduledStationArrivals['window'];
  timing: FrequencyTiming;
};

export type StationArrivalSourceDecision = {
  // Retain all query evidence and usable scheduled results in every branch.
  scheduled: ScheduledStationArrivals;
} & (
  | { source: 'scheduled'; reason: 'complete' | 'incomplete' }
  | {
      source: 'frequency';
      reason: 'coverage-gap';
      frequency: FrequencyArrivalCandidate;
    }
  | {
      source: 'unavailable';
      reason:
        | 'timetable-unavailable'
        | 'frequency-unavailable'
        | 'frequency-scope-or-window-mismatch';
    }
);

/** Private composition only; no reads, serving approval or crowd schedule overlay. */
export function selectStationArrivalSource(
  scheduled: ScheduledStationArrivals,
  frequency: FrequencyArrivalCandidate | null,
): StationArrivalSourceDecision {
  if (scheduled.complete) {
    return { source: 'scheduled', reason: 'complete', scheduled };
  }
  const hasFailure = scheduled.serviceDays.some(
    ({ selected, attempts }) =>
      selected === null &&
      attempts.some(
        ({ reason }) =>
          reason !== 'outside-feed-range' &&
          reason !== 'scope-not-covered' &&
          reason !== 'mapping-coverage-gap',
      ),
  );
  if (
    scheduled.unavailableProjections.length > 0 ||
    scheduled.serviceDays.length === 0 ||
    hasFailure
  ) {
    return {
      source: 'unavailable',
      reason: 'timetable-unavailable',
      scheduled,
    };
  }
  // Partial dates and untimed rows cannot safely mix with whole-window estimates.
  if (
    scheduled.serviceDays.some(({ selected }) => selected !== null) ||
    scheduled.untimedDepartureCount > 0
  ) {
    return { source: 'scheduled', reason: 'incomplete', scheduled };
  }
  // No attempts on an unselected date means no retained artifact in the query.
  if (frequency === null) {
    return {
      source: 'unavailable',
      reason: 'frequency-unavailable',
      scheduled,
    };
  }
  const { scope, window } = scheduled;
  const { timing } = frequency;
  if (
    scope.platformId !== undefined ||
    scope.stationId !== frequency.stationId ||
    scope.lineId !== timing.lineId ||
    scope.serviceId !== timing.serviceId ||
    scope.destinationStationId !== timing.destinationStationId ||
    Temporal.Instant.compare(
      window.startInstant,
      frequency.window.startInstant,
    ) !== 0 ||
    Temporal.Instant.compare(window.endInstant, frequency.window.endInstant) !==
      0 ||
    timing.departures.some(
      ({ time }) =>
        Temporal.Instant.compare(time, window.startInstant) < 0 ||
        Temporal.Instant.compare(time, window.endInstant) >= 0,
    )
  ) {
    return {
      source: 'unavailable',
      reason: 'frequency-scope-or-window-mismatch',
      scheduled,
    };
  }
  return { source: 'frequency', reason: 'coverage-gap', scheduled, frequency };
}
