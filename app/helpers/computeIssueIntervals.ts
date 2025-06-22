import { DateTime, Interval } from 'luxon';
import { assert } from '../util/assert';
import type { IssueRef } from '~/types';
import { rrulestr } from 'rrule';

export function computeIssueIntervals(issue: IssueRef): Interval[] {
  if (issue.endAt == null) {
    return [];
  }

  const startAt = DateTime.fromISO(issue.startAt).setZone('Asia/Singapore');
  assert(startAt.isValid);
  const endAt = DateTime.fromISO(issue.endAt).setZone('Asia/Singapore');
  assert(endAt.isValid);

  const issueIntervals: Interval[] = [];
  const tzEnvironment = DateTime.local().zoneName;

  if (issue.type === 'maintenance' && issue.rrule != null) {
    const rruleSet = rrulestr(issue.rrule);
    for (const dt of rruleSet.all()) {
      const dtStart = DateTime.fromISO(dt.toISOString())
        .toUTC()
        .setZone(rruleSet.options.tzid ?? 'Asia/Singapore', {
          keepLocalTime: tzEnvironment !== 'UTC',
        });
      assert(dtStart.isValid);
      const dtEnd = dtStart.plus(endAt.diff(startAt));
      issueIntervals.push(Interval.fromDateTimes(dtStart, dtEnd));
    }
  } else {
    issueIntervals.push(Interval.fromDateTimes(startAt, endAt));
  }

  return issueIntervals;
}
