import type { IssueType } from '@mrtdown/core';
import type { DateTime } from 'luxon';
import type { Line, LineSummary, LineSummaryStatus } from '~/types';
import {
  issueContributesToLineDowntime,
  issueContributesToLineStatus,
} from '~/util/issueOperationalEffects';
import {
  clipIssueIntervalsToRange,
  issueActiveNow,
  sumIntervalSeconds,
  type IssueIntervalBounds,
} from './issueIntervals';
import {
  createIssueTypeIntervalGroups,
  ISSUE_TYPES,
  sumIssueTypeIntervalGroups,
} from './issueTypeStats';
import {
  isLineFuture,
  isLineOperatingNow,
  lineDayType,
  serviceWindowForDate,
} from './lineService';
import { isoDate, nowSg } from './temporal';
import type { IssueWithOperationalEffects } from './types';

export function buildLineSummary(
  line: Line,
  issues: IssueWithOperationalEffects[],
  days: number,
  publicHolidaySet: Set<string>,
  referenceNow = nowSg(),
): LineSummary {
  const startDate = referenceNow.startOf('day').minus({ days: days - 1 });
  const breakdownByDates: LineSummary['breakdownByDates'] = {};
  const downtimeIntervalsByIssueType = createIssueTypeIntervalGroups();

  let totalServiceSeconds = 0;
  let totalDowntimeSeconds = 0;

  for (let offset = 0; offset < days; offset++) {
    const date = startDate.plus({ days: offset });
    const dayWindow = serviceWindowForDate(line, date, publicHolidaySet);
    const calendarDayStart = date.startOf('day');
    const calendarDayEnd = calendarDayStart.plus({ days: 1 });
    const allocationWindow = {
      start:
        dayWindow.start > calendarDayStart ? dayWindow.start : calendarDayStart,
      end: dayWindow.end < calendarDayEnd ? dayWindow.end : calendarDayEnd,
    };
    const dayBreakdown: LineSummary['breakdownByDates'][string] = {
      breakdownByIssueTypes: buildIssueTypeBreakdownForDate(
        issues,
        date,
        referenceNow,
        allocationWindow,
      ),
      dayType: lineDayType(date, publicHolidaySet),
    };

    if (!isLineFuture(line, date.endOf('day'))) {
      totalServiceSeconds += dayWindow.seconds;
    }

    const dailyDowntimeIntervals: IssueIntervalBounds[] = [];
    for (const issue of issues) {
      const contributingBounds = clipIssueIntervalsToRange(
        issue,
        dayWindow.start,
        dayWindow.end,
        referenceNow,
      );
      const dayOverlap = sumIntervalSeconds(contributingBounds, referenceNow);

      if (dayOverlap <= 0) {
        continue;
      }

      if (issueContributesToLineDowntime(issue)) {
        dailyDowntimeIntervals.push(...contributingBounds);
        downtimeIntervalsByIssueType[issue.type].push(...contributingBounds);
      }
    }

    totalDowntimeSeconds += sumIntervalSeconds(
      dailyDowntimeIntervals,
      referenceNow,
    );

    breakdownByDates[isoDate(date)] = dayBreakdown;
  }

  const activeNow = issues.filter((issue) =>
    issueActiveNow(issue, referenceNow),
  );
  let status: LineSummaryStatus = 'normal';
  if (isLineFuture(line, referenceNow)) {
    status = 'future_service';
  } else if (!isLineOperatingNow(line, publicHolidaySet, referenceNow)) {
    status = 'closed_for_day';
  } else if (
    activeNow.some(
      (issue) =>
        issue.type === 'disruption' && issueContributesToLineStatus(issue),
    )
  ) {
    status = 'ongoing_disruption';
  } else if (
    activeNow.some(
      (issue) =>
        issue.type === 'maintenance' && issueContributesToLineStatus(issue),
    )
  ) {
    status = 'ongoing_maintenance';
  } else if (
    activeNow.some(
      (issue) => issue.type === 'infra' && issueContributesToLineStatus(issue),
    )
  ) {
    status = 'ongoing_infra';
  }

  const durationSecondsByIssueType = sumIssueTypeIntervalGroups(
    downtimeIntervalsByIssueType,
    referenceNow,
  );

  return {
    lineId: line.id,
    status,
    durationSecondsByIssueType,
    durationSecondsTotalForIssues: Object.values(
      durationSecondsByIssueType,
    ).reduce((sum, value) => sum + (value ?? 0), 0),
    breakdownByDates,
    uptimeRatio:
      totalServiceSeconds > 0
        ? Math.max(0, 1 - totalDowntimeSeconds / totalServiceSeconds)
        : null,
    totalServiceSeconds: totalServiceSeconds > 0 ? totalServiceSeconds : null,
    totalDowntimeSeconds: totalServiceSeconds > 0 ? totalDowntimeSeconds : null,
    downtimeBreakdown:
      totalServiceSeconds > 0
        ? (['disruption', 'maintenance', 'infra'] as IssueType[]).map(
            (type) => ({
              type,
              downtimeSeconds: durationSecondsByIssueType[type] ?? 0,
            }),
          )
        : null,
    uptimeRank: null,
    totalLines: null,
  };
}

export function buildIssueTypeBreakdownForDate(
  issues: IssueWithOperationalEffects[],
  date: DateTime,
  referenceNow = nowSg(),
  allocationWindow = {
    start: date.startOf('day'),
    end: date.startOf('day').plus({ days: 1 }),
  },
): LineSummary['breakdownByDates'][string]['breakdownByIssueTypes'] {
  const breakdownByIssueTypes: LineSummary['breakdownByDates'][string]['breakdownByIssueTypes'] =
    {};
  const dailyIntervalsByIssueType = createIssueTypeIntervalGroups();

  for (const issueType of ISSUE_TYPES) {
    for (const issue of issues.filter((item) => item.type === issueType)) {
      const issueBounds = clipIssueIntervalsToRange(
        issue,
        allocationWindow.start,
        allocationWindow.end,
        referenceNow,
      );
      if (sumIntervalSeconds(issueBounds, referenceNow) <= 0) {
        continue;
      }

      dailyIntervalsByIssueType[issue.type].push(...issueBounds);
      const current = breakdownByIssueTypes[issue.type] ?? {
        totalDurationSeconds: 0,
        issueIds: [],
      };
      if (!current.issueIds.includes(issue.id)) {
        current.issueIds.push(issue.id);
      }
      breakdownByIssueTypes[issue.type] = current;
    }
  }

  const dailyDurationSecondsByIssueType = sumIssueTypeIntervalGroups(
    dailyIntervalsByIssueType,
    referenceNow,
  );
  for (const issueType of ISSUE_TYPES) {
    const current = breakdownByIssueTypes[issueType];
    if (current != null) {
      current.totalDurationSeconds = dailyDurationSecondsByIssueType[issueType];
    }
  }

  return breakdownByIssueTypes;
}

export function rankLineSummaries(lineSummaries: LineSummary[]) {
  const ranked = lineSummaries
    .filter((summary) => summary.uptimeRatio != null)
    .sort((a, b) => (b.uptimeRatio ?? 0) - (a.uptimeRatio ?? 0));

  return lineSummaries.map((summary) => {
    const rank = ranked.findIndex((item) => item.lineId === summary.lineId);
    return {
      ...summary,
      uptimeRank: summary.uptimeRatio != null ? rank + 1 : null,
      totalLines: ranked.length > 0 ? ranked.length : null,
    };
  });
}

export function buildIssuesByLineId(
  issues: Iterable<IssueWithOperationalEffects>,
) {
  const issuesByLineId: Record<string, IssueWithOperationalEffects[]> = {};

  for (const issue of issues) {
    for (const lineId of new Set(issue.lineIds)) {
      const lineIssues = issuesByLineId[lineId] ?? [];
      lineIssues.push(issue);
      issuesByLineId[lineId] = lineIssues;
    }
  }

  return issuesByLineId;
}
