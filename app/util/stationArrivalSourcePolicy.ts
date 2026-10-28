import type { ScheduledStationArrivals } from './scheduledStationArrivals';

export type StationArrivalSourceDecision = {
  scheduled: ScheduledStationArrivals;
} & (
  | { source: 'scheduled'; reason: 'complete' | 'incomplete' }
  | { source: 'unavailable'; reason: 'timetable-unavailable' }
);

/** Preserve partial timetable coverage; never synthesize departures across its gaps. */
export function selectStationArrivalSource(
  scheduled: ScheduledStationArrivals,
): StationArrivalSourceDecision {
  if (scheduled.complete) {
    return { source: 'scheduled', reason: 'complete', scheduled };
  }
  const hasFailure = scheduled.serviceDays.some(
    ({ selected, attempts, rollback }) =>
      rollback?.status === 'rejected' ||
      (selected === null &&
        attempts.some(
          ({ reason }) =>
            reason !== 'outside-feed-range' &&
            reason !== 'scope-not-covered' &&
            reason !== 'mapping-coverage-gap',
        )),
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
  // Partial dates and untimed rows retain their scheduled basis.
  if (
    scheduled.serviceDays.some(({ selected }) => selected !== null) ||
    scheduled.untimedDepartureCount > 0
  ) {
    return { source: 'scheduled', reason: 'incomplete', scheduled };
  }
  return { source: 'unavailable', reason: 'timetable-unavailable', scheduled };
}
