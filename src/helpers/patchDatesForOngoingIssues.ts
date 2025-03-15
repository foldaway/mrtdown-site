import { DateTime } from 'luxon';
import type { DateSummary, Issue } from '../types';
import { assert } from '../util/assert';

export function patchDatesForOngoingIssues(
  dates: Record<string, DateSummary>,
  issuesOngoing: Issue[],
) {
  for (const issue of issuesOngoing) {
    const startAt = DateTime.fromISO(issue.startAt);
    const diffDays = DateTime.now().diff(startAt).as('days');

    for (let i = 0; i < diffDays; i++) {
      const segmentStart = startAt.plus({ days: i });
      const segmentEnd = DateTime.min(
        DateTime.now(),
        segmentStart.plus({ days: 1 }),
      );
      const durationMs = segmentEnd.diff(segmentStart).as('milliseconds');
      const segmentStartIsoDate = segmentStart.toISODate();
      assert(segmentStartIsoDate != null);
      const dateSummary = dates[segmentStartIsoDate] ?? {
        issueTypesDurationMs: {},
        issues: [],
      };
      let issueTypeDuration = dateSummary.issueTypesDurationMs[issue.type] ?? 0;
      issueTypeDuration += durationMs;
      dateSummary.issueTypesDurationMs[issue.type] = issueTypeDuration;
      dateSummary.issues.push({
        id: issue.id,
        type: issue.type,
        title: issue.title,
        componentIdsAffected: issue.componentIdsAffected,
        startAt: issue.startAt,
        endAt: issue.endAt,
      });
      dates[segmentStartIsoDate] = dateSummary;
    }
  }
}
