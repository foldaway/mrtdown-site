import { DateTime } from 'luxon';
import { useMemo } from 'react';
import type { Issue, IssueInterval } from '~/types';
import type { IssueCardContext } from '../types';

const SG_TIMEZONE = 'Asia/Singapore';

function latest(
  intervals: readonly IssueInterval[],
): IssueInterval | undefined {
  return [...intervals].sort(
    (a, b) =>
      DateTime.fromISO(b.startAt).toMillis() -
      DateTime.fromISO(a.startAt).toMillis(),
  )[0];
}

export function selectIssueInterval(
  intervals: readonly IssueInterval[],
  context: IssueCardContext,
): IssueInterval | null {
  if (intervals.length === 0) return null;

  if (context.type === 'now') {
    const ongoing = latest(
      intervals.filter((interval) => interval.status === 'ongoing'),
    );
    if (ongoing != null) return ongoing;

    const future = intervals
      .filter((interval) => interval.status === 'future')
      .sort(
        (a, b) =>
          DateTime.fromISO(a.startAt).toMillis() -
          DateTime.fromISO(b.startAt).toMillis(),
      )[0];
    return future ?? latest(intervals) ?? null;
  }

  const start = DateTime.fromISO(context.date, { zone: SG_TIMEZONE });
  const end = start.plus({
    days: context.type === 'history.week' ? 7 : context.days,
  });
  const matching = intervals.filter((interval) => {
    const intervalStart = DateTime.fromISO(interval.startAt);
    const intervalEnd =
      interval.endAt != null ? DateTime.fromISO(interval.endAt) : null;
    return intervalStart < end && (intervalEnd == null || intervalEnd > start);
  });

  // A station can list older issues outside the current history window.
  return latest(matching.length > 0 ? matching : intervals) ?? null;
}

export const useIssueInterval = (
  issue: Issue,
  context: IssueCardContext,
): IssueInterval | null =>
  useMemo(
    () => selectIssueInterval(issue.intervals, context),
    [issue.intervals, context],
  );
