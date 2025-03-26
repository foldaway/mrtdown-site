import { type DateTime, Interval } from 'luxon';
import { assert } from '../util/assert';

export function computeStartOfDaysWithinInterval(
  start: DateTime,
  end: DateTime,
): DateTime[] {
  const interval = Interval.fromDateTimes(start.startOf('day'), end);
  const segments = interval.splitBy({ days: 1 });

  if (start.toMillis() !== start.startOf('day').toMillis()) {
    segments.splice(0, 1);
  }

  const result: DateTime[] = segments.map((segment) => {
    assert(segment.start != null);
    return segment.start;
  });

  return result;
}
