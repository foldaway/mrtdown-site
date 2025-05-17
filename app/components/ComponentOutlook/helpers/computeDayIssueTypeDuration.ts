import { DateTime, Interval } from 'luxon';
import { sumIntervalDuration } from '~/helpers/sumIntervalDuration';
import type { IssueType } from '~/types';

export function computeDayIssueTypeDuration(
  dateTime: DateTime,
  issueTypesIntervalsNoOverlapMs: Partial<Record<IssueType, string[]>>,
  now = DateTime.now(),
) {
  const eodDateTime = dateTime.startOf('day').plus({ days: 1 });
  const result: Record<IssueType, number> = {
    disruption: 0,
    maintenance: 0,
    infra: 0,
  };

  const cutoffDateTime = DateTime.min(now, eodDateTime);
  const dayInterval = Interval.fromDateTimes(
    dateTime.startOf('day'),
    cutoffDateTime,
  );

  for (const [issueType, intervalIsos] of Object.entries(
    issueTypesIntervalsNoOverlapMs,
  )) {
    const _issueType = issueType as IssueType;
    const intervals = intervalIsos.map((iso) => Interval.fromISO(iso));
    const mergedInterval = Interval.merge(intervals).filter((interval) =>
      interval.overlaps(dayInterval),
    );
    result[_issueType] = sumIntervalDuration(mergedInterval).as('milliseconds');
  }

  return result;
}
