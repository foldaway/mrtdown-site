import type { IssueType } from '@mrtdown/core';
import type { DateTime } from 'luxon';
import type {
  ChartEntry,
  Granularity,
  Issue,
  Line,
  LineSummary,
  LineSummaryStatus,
  TimeScaleChart,
} from '~/types';
import {
  issueContributesToLineDowntime,
  issueContributesToLineStatus,
} from '~/util/issueOperationalEffects';
import {
  buildCountChart,
  makeTimeScale,
  type TimeScale,
} from './analyticsShared';
import {
  isoDate,
  isoDateTime,
  nowSg,
  parseDateTime,
  SG_TIMEZONE,
} from './dateTime';
import {
  createIssueTypeIntervalGroups,
  emptyIssueTypePayload,
  sumIssueTypeIntervalGroups,
} from './issueAnalytics';
import {
  clipIntervalToRange,
  clipIssueIntervalsToRange,
  getIssueBounds,
  ISSUE_TYPES,
  type IssueIntervalBounds,
  type IssueWithOperationalEffects,
  issueActiveNow,
  mergeIntervals,
  sumIntervalSeconds,
} from './issueIntervals';
import {
  isLineFuture,
  isLineOperatingNow,
  lineDayType,
  serviceWindowAfterLineStart,
  serviceWindowForDate,
} from './serviceOperations';

export function buildLineSummary(
  line: Line,
  issues: IssueWithOperationalEffects[],
  days: number,
  publicHolidaySet: Set<string>,
  referenceNow = nowSg(),
): LineSummary {
  const referenceDateTime = referenceNow.setZone(SG_TIMEZONE);
  const startDate = referenceDateTime.startOf('day').minus({ days: days - 1 });
  const breakdownByDates: LineSummary['breakdownByDates'] = {};
  const downtimeIntervalsByIssueType = createIssueTypeIntervalGroups();

  let totalServiceSeconds = 0;
  let totalDowntimeSeconds = 0;

  for (let offset = 0; offset < days; offset++) {
    const date = startDate.plus({ days: offset });
    const dayWindow = serviceWindowForDate(line, date, publicHolidaySet);
    const dayBreakdown: LineSummary['breakdownByDates'][string] = {
      breakdownByIssueTypes: {},
      dayType: lineDayType(date, publicHolidaySet),
    };

    if (!isLineFuture(line, date.endOf('day'))) {
      totalServiceSeconds += dayWindow.seconds;
    }

    const dailyDowntimeIntervals: IssueIntervalBounds[] = [];
    const dailyIntervalsByIssueType = createIssueTypeIntervalGroups();

    for (const issue of issues) {
      const contributingBounds = clipIssueIntervalsToRange(
        issue,
        dayWindow.start,
        dayWindow.end,
        referenceDateTime,
      );
      const dayOverlap = sumIntervalSeconds(
        contributingBounds,
        referenceDateTime,
      );

      if (dayOverlap <= 0) {
        continue;
      }

      dailyIntervalsByIssueType[issue.type].push(...contributingBounds);

      if (issueContributesToLineDowntime(issue)) {
        dailyDowntimeIntervals.push(...contributingBounds);
        downtimeIntervalsByIssueType[issue.type].push(...contributingBounds);
      }

      const current = dayBreakdown.breakdownByIssueTypes[issue.type] ?? {
        totalDurationSeconds: 0,
        issueIds: [],
        intervals: [],
      };
      if (!current.issueIds.includes(issue.id)) {
        current.issueIds.push(issue.id);
      }
      dayBreakdown.breakdownByIssueTypes[issue.type] = current;
    }

    const dailyDurationSecondsByIssueType = sumIssueTypeIntervalGroups(
      dailyIntervalsByIssueType,
      referenceDateTime,
    );
    for (const issueType of ISSUE_TYPES) {
      const current = dayBreakdown.breakdownByIssueTypes[issueType];
      if (current != null) {
        current.totalDurationSeconds =
          dailyDurationSecondsByIssueType[issueType];
        current.intervals = mergeIntervals(
          dailyIntervalsByIssueType[issueType],
        ).flatMap((interval) =>
          interval.end == null
            ? []
            : [
                {
                  startAt: isoDateTime(interval.start),
                  endAt: isoDateTime(interval.end),
                },
              ],
        );
      }
    }

    totalDowntimeSeconds += sumIntervalSeconds(
      dailyDowntimeIntervals,
      referenceDateTime,
    );

    breakdownByDates[isoDate(date)] = dayBreakdown;
  }

  const activeNow = issues.filter((issue) =>
    issueActiveNow(issue, referenceDateTime),
  );
  let status: LineSummaryStatus = 'normal';
  if (isLineFuture(line, referenceDateTime)) {
    status = 'future_service';
  } else if (!isLineOperatingNow(line, publicHolidaySet, referenceDateTime)) {
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
    referenceDateTime,
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

function buildWindowCountEntries(
  issues: Issue[],
  start: DateTime,
  count: number,
  stepUnit: Granularity,
  durationMode = false,
) {
  const entries: ChartEntry[] = [];

  for (let index = 0; index < count; index++) {
    const bucketStart = start.plus({ [stepUnit]: index } as Record<
      Granularity,
      number
    >);
    const bucketEnd = bucketStart.plus({ [stepUnit]: 1 } as Record<
      Granularity,
      number
    >);
    const payload = emptyIssueTypePayload();

    if (!durationMode) {
      for (const issue of issues) {
        const firstStart = issue.intervals[0]?.startAt;
        if (firstStart == null) {
          continue;
        }

        const firstStartAt = parseDateTime(firstStart);
        if (firstStartAt >= bucketStart && firstStartAt < bucketEnd) {
          payload[issue.type] += 1;
        }
      }
    } else {
      const intervalsByType: Record<IssueType, IssueIntervalBounds[]> = {
        disruption: [],
        maintenance: [],
        infra: [],
      };

      for (const issue of issues) {
        for (const interval of getIssueBounds(issue)) {
          const clipped = clipIntervalToRange(
            interval.start,
            interval.end,
            bucketStart,
            bucketEnd,
          );
          if (clipped != null) {
            intervalsByType[issue.type].push(clipped);
          }
        }
      }

      payload.disruption = sumIntervalSeconds(intervalsByType.disruption);
      payload.maintenance = sumIntervalSeconds(intervalsByType.maintenance);
      payload.infra = sumIntervalSeconds(intervalsByType.infra);
    }

    entries.push({
      name: isoDate(bucketStart),
      payload,
    });
  }

  return entries;
}

export function buildPreviousWindowSummary(
  issues: Issue[],
  currentStart: DateTime,
  count: number,
  stepUnit: Granularity,
  durationMode = false,
) {
  const currentEntries = buildWindowCountEntries(
    issues,
    currentStart,
    count,
    stepUnit,
    durationMode,
  );
  const previousStart = currentStart.minus({ [stepUnit]: count } as Record<
    Granularity,
    number
  >);
  const previousEntries = buildWindowCountEntries(
    issues,
    previousStart,
    count,
    stepUnit,
    durationMode,
  );

  const summarize = (entries: ChartEntry[]) => {
    return entries.reduce<Record<string, number>>(
      (acc, entry) => {
        acc.disruption += entry.payload.disruption ?? 0;
        acc.maintenance += entry.payload.maintenance ?? 0;
        acc.infra += entry.payload.infra ?? 0;
        return acc;
      },
      { disruption: 0, maintenance: 0, infra: 0 },
    );
  };

  return {
    data: currentEntries,
    cumulative: [
      {
        name: 'current',
        payload: summarize(currentEntries),
      },
      {
        name: 'previous',
        payload: summarize(previousEntries),
      },
    ],
  };
}

export function buildUptimeGraph(
  line: Line,
  issues: IssueWithOperationalEffects[],
  publicHolidaySet: Set<string>,
  count: number,
): TimeScaleChart {
  const end = nowSg().startOf('day');
  const start = end.minus({ days: count - 1 });
  const data: ChartEntry[] = [];

  for (let offset = 0; offset < count; offset++) {
    const date = start.plus({ days: offset });
    const serviceWindow = serviceWindowAfterLineStart(
      line,
      serviceWindowForDate(line, date, publicHolidaySet),
    );
    const downtimeIntervals: IssueIntervalBounds[] = [];
    const downtimeIntervalsByIssueType = createIssueTypeIntervalGroups();

    if (serviceWindow.seconds > 0) {
      for (const issue of issues) {
        if (!issueContributesToLineDowntime(issue)) {
          continue;
        }

        const intervals = clipIssueIntervalsToRange(
          issue,
          serviceWindow.start,
          serviceWindow.end,
        );
        if (intervals.length === 0) {
          continue;
        }

        downtimeIntervals.push(...intervals);
        downtimeIntervalsByIssueType[issue.type].push(...intervals);
      }
    }

    const totalDowntime = sumIntervalSeconds(downtimeIntervals);
    const downtimeSecondsByIssueType = sumIssueTypeIntervalGroups(
      downtimeIntervalsByIssueType,
    );
    data.push({
      name: isoDate(date),
      payload: {
        uptimeRatio:
          serviceWindow.seconds > 0
            ? Math.max(0, 1 - totalDowntime / serviceWindow.seconds)
            : 1,
        'breakdown.disruption': downtimeSecondsByIssueType.disruption,
        'breakdown.maintenance': downtimeSecondsByIssueType.maintenance,
        'breakdown.infra': downtimeSecondsByIssueType.infra,
      },
    });
  }

  const buildAggregate = (windowStart: DateTime, windowCount: number) => {
    let serviceSeconds = 0;
    const downtimeIntervals: IssueIntervalBounds[] = [];
    for (let offset = 0; offset < windowCount; offset++) {
      const date = windowStart.plus({ days: offset });
      const serviceWindow = serviceWindowAfterLineStart(
        line,
        serviceWindowForDate(line, date, publicHolidaySet),
      );
      if (serviceWindow.seconds <= 0) {
        continue;
      }
      serviceSeconds += serviceWindow.seconds;
      for (const issue of issues) {
        if (!issueContributesToLineDowntime(issue)) {
          continue;
        }
        downtimeIntervals.push(
          ...clipIssueIntervalsToRange(
            issue,
            serviceWindow.start,
            serviceWindow.end,
          ),
        );
      }
    }
    const downtime = sumIntervalSeconds(downtimeIntervals);
    return serviceSeconds > 0 ? Math.max(0, 1 - downtime / serviceSeconds) : 1;
  };

  return buildCountChart(
    `${count}d`,
    data,
    [
      {
        name: 'current',
        payload: { uptimeRatio: buildAggregate(start, count) },
      },
      {
        name: 'previous',
        payload: {
          uptimeRatio: buildAggregate(start.minus({ days: count }), count),
        },
      },
    ],
    makeTimeScale('day', count),
  );
}

export function buildOperatorUptimeGraph(
  lines: Line[],
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>,
  publicHolidaySet: Set<string>,
  count: number,
): TimeScaleChart {
  const end = nowSg().startOf('day');
  const start = end.minus({ days: count - 1 });
  const data: ChartEntry[] = [];

  const computeWindow = (windowStart: DateTime, windowCount: number) => {
    let serviceSeconds = 0;
    let downtimeSeconds = 0;

    for (let offset = 0; offset < windowCount; offset++) {
      const date = windowStart.plus({ days: offset });

      for (const line of lines) {
        if (isLineFuture(line, date.endOf('day'))) {
          continue;
        }

        const serviceWindow = serviceWindowForDate(
          line,
          date,
          publicHolidaySet,
        );
        serviceSeconds += serviceWindow.seconds;
        const lineDowntimeIntervals: IssueIntervalBounds[] = [];

        for (const issue of issuesByLineId[line.id] ?? []) {
          if (!issueContributesToLineDowntime(issue)) {
            continue;
          }

          lineDowntimeIntervals.push(
            ...clipIssueIntervalsToRange(
              issue,
              serviceWindow.start,
              serviceWindow.end,
            ),
          );
        }

        downtimeSeconds += sumIntervalSeconds(lineDowntimeIntervals);
      }
    }

    return {
      serviceSeconds,
      downtimeSeconds,
      uptimeRatio:
        serviceSeconds > 0
          ? Math.max(0, 1 - downtimeSeconds / serviceSeconds)
          : 1,
    };
  };

  for (let offset = 0; offset < count; offset++) {
    const date = start.plus({ days: offset });
    const summary = computeWindow(date, 1);
    data.push({
      name: isoDate(date),
      payload: { uptimeRatio: summary.uptimeRatio },
    });
  }

  const current = computeWindow(start, count);
  const previous = computeWindow(start.minus({ days: count }), count);

  return buildCountChart(
    `${count}d`,
    data,
    [
      { name: 'current', payload: { uptimeRatio: current.uptimeRatio } },
      { name: 'previous', payload: { uptimeRatio: previous.uptimeRatio } },
    ],
    makeTimeScale('day', count),
  );
}

export function buildIssueCountGraphs(issues: Issue[]) {
  const end = nowSg().startOf('day');
  return [7, 30, 90].map((count) => {
    const start = end.minus({ days: count - 1 });
    const { data, cumulative } = buildPreviousWindowSummary(
      issues,
      start,
      count,
      'day',
      false,
    );
    return buildCountChart(
      `${count}d`,
      data,
      cumulative,
      makeTimeScale('day', count),
    );
  });
}

export function getWindowStart(end: DateTime, timeScale: TimeScale) {
  switch (timeScale.granularity) {
    case 'day':
      return end.startOf('day').minus({ days: timeScale.count - 1 });
    case 'month':
      return end.startOf('month').minus({ months: timeScale.count - 1 });
    case 'year':
      return end.startOf('year').minus({ years: timeScale.count - 1 });
  }
}

export function getWindowEnd(start: DateTime, timeScale: TimeScale) {
  switch (timeScale.granularity) {
    case 'day':
      return start.plus({ days: timeScale.count });
    case 'month':
      return start.plus({ months: timeScale.count });
    case 'year':
      return start.plus({ years: timeScale.count });
  }
}

export function getBucketEnd(start: DateTime, granularity: Granularity) {
  switch (granularity) {
    case 'day':
      return start.plus({ days: 1 });
    case 'month':
      return start.plus({ months: 1 });
    case 'year':
      return start.plus({ years: 1 });
  }
}

export function getDatePlus(
  date: DateTime,
  granularity: Granularity,
  count: number,
) {
  switch (granularity) {
    case 'day':
      return date.plus({ days: count });
    case 'month':
      return date.plus({ months: count });
    case 'year':
      return date.plus({ years: count });
  }
}

export function getDateMinus(
  date: DateTime,
  granularity: Granularity,
  count: number,
) {
  switch (granularity) {
    case 'day':
      return date.minus({ days: count });
    case 'month':
      return date.minus({ months: count });
    case 'year':
      return date.minus({ years: count });
  }
}
