import { DateTime, Interval } from 'luxon';
import type { DateSummary, Issue } from '../types';
import { assert } from '../util/assert';
import { splitIntervalByServiceHours } from './splitIntervalByServiceHours';
import { computeIssueIntervals } from './computeIssueIntervals';

export function patchDatesForOngoingIssues(
  dates: Record<string, DateSummary>,
  issuesOngoingSnapshot: Issue[],
) {
  const now = DateTime.now();
  const intervalToday = Interval.fromDateTimes(
    now.startOf('day'),
    now.startOf('day').plus({ days: 1 }),
  );

  for (let i = issuesOngoingSnapshot.length - 1; i >= 0; i--) {
    const issue = issuesOngoingSnapshot[i];
    if (issue.endAt == null) {
      continue;
    }

    const startAt = DateTime.fromISO(issue.startAt);
    assert(startAt.isValid);
    const endAt = DateTime.fromISO(issue.endAt);
    assert(endAt.isValid);

    const intervals = computeIssueIntervals(issue);

    if (
      !intervals.some((i) => {
        return i.overlaps(intervalToday);
      })
    ) {
      issuesOngoingSnapshot.splice(i, 1);
    }
  }

  for (const issue of issuesOngoingSnapshot) {
    const startAt = DateTime.fromISO(issue.startAt);
    assert(startAt.isValid);

    const intervals = computeIssueIntervals(issue);
    for (const interval of intervals) {
      if (!interval.isValid) {
        continue;
      }
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
        let issueTypeDuration =
          dateSummary.issueTypesDurationMs[issue.type] ?? 0;
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
            dateSummary.componentIdsIssueTypesIntervalsNoOverlapMs[
              componentId
            ] ?? {};
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
}
