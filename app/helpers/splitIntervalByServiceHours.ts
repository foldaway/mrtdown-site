import { DateTime, type Interval } from 'luxon';
import { computeStartOfDaysWithinInterval } from './computeStartOfDaysWithinInterval';
import { assert } from '../util/assert';

export function splitIntervalByServiceHours(interval: Interval): Interval[] {
  assert(interval.start != null);
  assert(interval.end != null);

  const startOfDaysWithinRange = computeStartOfDaysWithinInterval(
    interval.start,
    interval.end,
  );

  const segments: Interval[] = [];

  for (const segment of interval.splitAt(...startOfDaysWithinRange)) {
    const { start, end } = segment;
    assert(start != null);
    assert(end != null);

    const segmentStart = DateTime.max(
      start,
      start.set({ hour: 5, minute: 30, second: 0, millisecond: 0 }), // Limit to start of general service hours
    );
    const segmentEnd = DateTime.max(end, segmentStart);
    const segmentDuration = segmentEnd.diff(segmentStart);

    if (segmentDuration.as('milliseconds') <= 0) {
      continue;
    }

    const segmentUpdated = segment.set({
      start: segmentStart,
      end: segmentEnd,
    });

    if (!segmentUpdated.isValid) {
      continue;
    }

    segments.push(segmentUpdated);
  }

  return segments;
}
