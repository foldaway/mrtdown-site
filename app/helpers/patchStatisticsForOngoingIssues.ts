import { DateTime, Interval } from 'luxon';
import type { Statistics } from '~/types';
import { computeIssueIntervals } from './computeIssueIntervals';
import { patchDatesForOngoingIssues } from './patchDatesForOngoingIssues';
import { sumIntervalDuration } from './sumIntervalDuration';

export function patchStatisticsForOngoingIssues(statistics: Statistics) {
  const now = DateTime.now();
  patchDatesForOngoingIssues(
    statistics.dates,
    statistics.issuesOngoingSnapshot,
  );

  for (const issue of statistics.issuesOngoingSnapshot) {
    const startAt = DateTime.fromISO(issue.startAt).setZone('Asia/Singapore');
    const interval = Interval.fromDateTimes(startAt, now);

    switch (issue.type) {
      case 'disruption': {
        const duration = interval.toDuration();
        statistics.issuesDisruptionDurationTotalDays += duration.as('days');
        statistics.issuesDisruptionHistoricalCount += 1;

        const lastLongestDisruption = statistics.issuesDisruptionLongest.at(-1);
        if (lastLongestDisruption != null) {
          const lastLongestDisruptionIntervals = computeIssueIntervals(
            lastLongestDisruption,
          );
          const lastLongestDisruptionDuration = sumIntervalDuration(
            lastLongestDisruptionIntervals,
          );

          if (lastLongestDisruptionDuration < duration) {
            statistics.issuesDisruptionLongest.push(issue);
            statistics.issuesDisruptionLongest.sort((a, b) => {
              const aStartAt = DateTime.fromISO(a.startAt);
              const bStartAt = DateTime.fromISO(b.startAt);
              const aDuration =
                a.endAt != null
                  ? sumIntervalDuration(computeIssueIntervals(a))
                  : now.diff(aStartAt);
              const bDuration =
                b.endAt != null
                  ? sumIntervalDuration(computeIssueIntervals(b))
                  : now.diff(bStartAt);

              if (aDuration < bDuration) {
                return 1;
              }
              if (aDuration > bDuration) {
                return -1;
              }
              return 0;
            });
          }
        }

        for (const componentId of issue.componentIdsAffected) {
          statistics.componentsIssuesDisruptionCount[componentId] += 1;
        }
        break;
      }
    }

    const stationIssuesKeyed = statistics.stationIssues.reduce(
      (acc, entry) => {
        acc[entry.station.id] = entry;
        return acc;
      },
      {} as Record<string, { station: { id: string }; count: number }>,
    );

    for (const entry of issue.stationIdsAffected) {
      for (const stationId of entry.stationIds) {
        stationIssuesKeyed[stationId].count += 1;
      }
    }
  }
}
