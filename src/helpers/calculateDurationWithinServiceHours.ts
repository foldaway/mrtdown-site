import { type DateTime, Duration, Interval } from 'luxon';
import { assert } from '../util/assert';
import { splitIntervalByServiceHours } from './splitIntervalByServiceHours';

export function calculateDurationWithinServiceHours(
  start: DateTime,
  end: DateTime,
): Duration {
  const interval = Interval.fromDateTimes(start, end);
  assert(interval.isValid);

  let result = Duration.fromObject({ seconds: 0 });

  for (const segment of splitIntervalByServiceHours(interval)) {
    result = result.plus(segment.toDuration());
  }

  return result;
}
