import { Duration, type Interval } from 'luxon';

export function sumIntervalDuration(intervals: Interval[]) {
  let duration = Duration.fromObject({ milliseconds: 0 });
  for (const segment of intervals) {
    duration = duration.plus(segment.toDuration());
  }
  return duration;
}
