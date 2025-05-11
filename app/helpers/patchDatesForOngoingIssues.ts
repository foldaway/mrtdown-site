import { DateTime, Interval } from 'luxon';
import type { DateSummary, Issue } from '../types';
import { assert } from '../util/assert';
import { splitIntervalByServiceHours } from './splitIntervalByServiceHours';

export function patchDatesForOngoingIssues(
  dates: Record<string, DateSummary>,
  issuesOngoing: Issue[],
) {
  for (const issue of issuesOngoing) {
    const startAt = DateTime.fromISO(issue.startAt);
    assert(startAt.isValid);
    const interval = Interval.fromDateTimes(startAt, DateTime.now());
    for (const segment of splitIntervalByServiceHours(interval)) {
      assert(segment.start != null);
      assert(segment.end != null);

      const segmentStartIsoDate = segment.start.toISODate();
      assert(segmentStartIsoDate != null);
      const dateSummary =
        dates[segmentStartIsoDate] ??
        ({
          componentIdsIssueTypesDurationMs: {},
          issueTypesDurationMs: {},
          issueTypesIntervalsNoOverlapMs: {},
          componentIdsIssueTypesIntervalsNoOverlapMs: {},
          issues: [],
        } satisfies DateSummary);
      let issueTypeDuration = dateSummary.issueTypesDurationMs[issue.type] ?? 0;
      issueTypeDuration += segment.toDuration().as('milliseconds');
      dateSummary.issueTypesDurationMs[issue.type] = issueTypeDuration;

      const issueTypeIntervalNoOverlap =
        dateSummary.issueTypesIntervalsNoOverlapMs[issue.type] ?? [];
      issueTypeIntervalNoOverlap.push(segment.toISO());
      dateSummary.issueTypesIntervalsNoOverlapMs[issue.type] =
        issueTypeIntervalNoOverlap;

      dateSummary.issues.push({
        id: issue.id,
        type: issue.type,
        title: issue.title,
        componentIdsAffected: issue.componentIdsAffected,
        stationIdsAffected: issue.stationIdsAffected,
        startAt: issue.startAt,
        endAt: issue.endAt,
        subtypes: issue.subtypes,
      });
      for (const componentId of issue.componentIdsAffected) {
        const componentIssueTypeDurationMs =
          dateSummary.componentIdsIssueTypesDurationMs[componentId] ?? {};
        let durationMs = componentIssueTypeDurationMs[issue.type] ?? 0;
        durationMs += segment.toDuration().as('milliseconds');
        componentIssueTypeDurationMs[issue.type] = durationMs;
        dateSummary.componentIdsIssueTypesDurationMs[componentId] =
          componentIssueTypeDurationMs;

        const componentIssueTypesIntervalsNoOverlapMs =
          dateSummary.componentIdsIssueTypesIntervalsNoOverlapMs[componentId] ??
          {};
        const intervalsNoOverlapMs =
          componentIssueTypesIntervalsNoOverlapMs[issue.type] ?? [];
        intervalsNoOverlapMs.push(segment.toISO());
        componentIssueTypesIntervalsNoOverlapMs[issue.type] =
          intervalsNoOverlapMs;
        dateSummary.componentIdsIssueTypesIntervalsNoOverlapMs[componentId] =
          componentIssueTypesIntervalsNoOverlapMs;
      }
      dates[segmentStartIsoDate] = dateSummary;
    }
  }
}
