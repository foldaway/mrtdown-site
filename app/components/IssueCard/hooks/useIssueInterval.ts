import { DateTime, Interval } from 'luxon';
import { useMemo } from 'react';
import type { Issue, IssueInterval } from '~/client';
import type { IssueCardContext } from '../types';

export const useIssueInterval = (
  issue: Issue,
  context: IssueCardContext,
): IssueInterval | null => {
  return useMemo(() => {
    let intervalsSorted: IssueInterval[];

    switch (context.type) {
      case 'now': {
        intervalsSorted = issue.intervals.sort((a, b) => {
          switch (a.status) {
            case 'ongoing':
            case 'future': {
              return -1;
            }
          }

          switch (b.status) {
            case 'ongoing':
            case 'future': {
              return 1;
            }
          }

          return 0;
        });
        break;
      }
      case 'history.week': {
        const contextDate = DateTime.fromISO(context.date);
        const intervalWeek = Interval.fromDateTimes(
          contextDate,
          contextDate.plus({ week: 1 }),
        );

        intervalsSorted = issue.intervals.sort((a, b) => {
          const dateTimeStartAtA = DateTime.fromISO(a.startAt);
          const dateTimeEndAtA =
            a.endAt != null ? DateTime.fromISO(a.endAt) : DateTime.now();
          const intervalA = Interval.fromDateTimes(
            dateTimeStartAtA,
            dateTimeEndAtA,
          );

          if (intervalA.overlaps(intervalWeek)) {
            return -1;
          }

          const dateTimeStartAtB = DateTime.fromISO(b.startAt);
          const dateTimeEndAtB =
            b.endAt != null ? DateTime.fromISO(b.endAt) : DateTime.now();
          const intervalB = Interval.fromDateTimes(
            dateTimeStartAtB,
            dateTimeEndAtB,
          );

          if (intervalB.overlaps(intervalWeek)) {
            return 1;
          }

          return 0;
        });

        break;
      }
      case 'history.days': {
        const contextDate = DateTime.fromISO(context.date);
        const intervalDays = Interval.fromDateTimes(
          contextDate,
          contextDate.plus({ days: context.days }),
        );

        intervalsSorted = issue.intervals.sort((a, b) => {
          const dateTimeStartAtA = DateTime.fromISO(a.startAt);
          const dateTimeEndAtA =
            a.endAt != null ? DateTime.fromISO(a.endAt) : DateTime.now();
          const intervalA = Interval.fromDateTimes(
            dateTimeStartAtA,
            dateTimeEndAtA,
          );

          if (intervalA.overlaps(intervalDays)) {
            return -1;
          }

          const dateTimeStartAtB = DateTime.fromISO(b.startAt);
          const dateTimeEndAtB =
            b.endAt != null ? DateTime.fromISO(b.endAt) : DateTime.now();
          const intervalB = Interval.fromDateTimes(
            dateTimeStartAtB,
            dateTimeEndAtB,
          );

          if (intervalB.overlaps(intervalDays)) {
            return 1;
          }

          return 0;
        });

        break;
      }
    }

    return intervalsSorted?.[0] ?? null;
  }, [issue.intervals, context]);
};
