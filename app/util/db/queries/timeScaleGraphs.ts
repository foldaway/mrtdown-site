import type { IssueType, ServiceEffectKind } from '@mrtdown/core';
import type { DateTime } from 'luxon';
import type {
  ChartEntry,
  Granularity,
  Issue,
  Line,
  TimeScaleChart,
} from '~/types';
import { issueContributesToLineDowntime } from '~/util/issueOperationalEffects';
import { buildCountChart, makeTimeScale, type TimeScale } from './chartHelpers';
import {
  clipIntervalToRange,
  clipIssueIntervalsToRange,
  getIssueBounds,
  issueOverlapsRange,
  sumIntervalSeconds,
  type IssueIntervalBounds,
} from './issueIntervals';
import {
  createIssueTypeCounts,
  createIssueTypeIntervalGroups,
  emptyIssueTypePayload,
  groupIssueFactCountsByDate,
  groupIssueFactRowsByDate,
  sumIssueTypeIntervalGroups,
  type IssueDayFactRow,
  type IssueTypeCounts,
} from './issueTypeStats';
import {
  isLineFuture,
  serviceWindowAfterLineStart,
  serviceWindowForDate,
} from './lineService';
import { isoDate, nowSg, parseDateTime } from './temporal';

type StatisticsTimeWindow = {
  title: string;
  dataTimeScale: TimeScale;
  displayTimeScale?: TimeScale;
};

type IssueWithServiceEffects = Issue & {
  serviceEffectKinds: ServiceEffectKind[];
};

const STATISTICS_TIME_WINDOWS: StatisticsTimeWindow[] = [
  { title: '7d', dataTimeScale: makeTimeScale('day', 7) },
  {
    title: '1m',
    dataTimeScale: makeTimeScale('day', 30),
    displayTimeScale: makeTimeScale('month', 1),
  },
  {
    title: '1y',
    dataTimeScale: makeTimeScale('month', 12),
    displayTimeScale: makeTimeScale('year', 1),
  },
  { title: '10y', dataTimeScale: makeTimeScale('year', 10) },
  { title: '20y', dataTimeScale: makeTimeScale('year', 20) },
];

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

function buildPreviousWindowSummary(
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
  issues: IssueWithServiceEffects[],
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
  issuesByLineId: Record<string, IssueWithServiceEffects[]>,
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

function getWindowStart(end: DateTime, timeScale: TimeScale) {
  switch (timeScale.granularity) {
    case 'day':
      return end.startOf('day').minus({ days: timeScale.count - 1 });
    case 'month':
      return end.startOf('month').minus({ months: timeScale.count - 1 });
    case 'year':
      return end.startOf('year').minus({ years: timeScale.count - 1 });
  }
}

function getWindowEnd(start: DateTime, timeScale: TimeScale) {
  switch (timeScale.granularity) {
    case 'day':
      return start.plus({ days: timeScale.count });
    case 'month':
      return start.plus({ months: timeScale.count });
    case 'year':
      return start.plus({ years: timeScale.count });
  }
}

function getBucketEnd(start: DateTime, granularity: Granularity) {
  switch (granularity) {
    case 'day':
      return start.plus({ days: 1 });
    case 'month':
      return start.plus({ months: 1 });
    case 'year':
      return start.plus({ years: 1 });
  }
}

function getDatePlus(date: DateTime, granularity: Granularity, count: number) {
  switch (granularity) {
    case 'day':
      return date.plus({ days: count });
    case 'month':
      return date.plus({ months: count });
    case 'year':
      return date.plus({ years: count });
  }
}

function getDateMinus(date: DateTime, granularity: Granularity, count: number) {
  switch (granularity) {
    case 'day':
      return date.minus({ days: count });
    case 'month':
      return date.minus({ months: count });
    case 'year':
      return date.minus({ years: count });
  }
}

export function buildStatisticsIssueCountGraphs(issues: Issue[]) {
  const end = nowSg().startOf('day');
  const aggregateForRange = (rangeStart: DateTime, rangeEnd: DateTime) => {
    const payload = emptyIssueTypePayload();
    for (const issue of issues) {
      if (issueOverlapsRange(issue, rangeStart, rangeEnd)) {
        payload[issue.type] += 1;
      }
    }
    return payload;
  };

  return STATISTICS_TIME_WINDOWS.map((window) => {
    const start = getWindowStart(end, window.dataTimeScale);
    const data: ChartEntry[] = [];
    for (let offset = 0; offset < window.dataTimeScale.count; offset++) {
      const bucketStart = getDatePlus(
        start,
        window.dataTimeScale.granularity,
        offset,
      );
      const bucketEnd = getBucketEnd(
        bucketStart,
        window.dataTimeScale.granularity,
      );
      data.push({
        name: isoDate(bucketStart),
        payload: aggregateForRange(bucketStart, bucketEnd),
      });
    }

    const currentEnd = getWindowEnd(start, window.dataTimeScale);
    const previousStart = getDateMinus(
      start,
      window.dataTimeScale.granularity,
      window.dataTimeScale.count,
    );
    return buildCountChart(
      window.title,
      data,
      [
        { name: 'current', payload: aggregateForRange(start, currentEnd) },
        { name: 'previous', payload: aggregateForRange(previousStart, start) },
      ],
      window.dataTimeScale,
      window.displayTimeScale,
    );
  });
}

export function getStatisticsFactStart(end: DateTime) {
  const earliestWindow = STATISTICS_TIME_WINDOWS.reduce<DateTime | null>(
    (earliest, window) => {
      const start = getWindowStart(end, window.dataTimeScale);
      const previousStart = getDateMinus(
        start,
        window.dataTimeScale.granularity,
        window.dataTimeScale.count,
      );
      return earliest == null || previousStart < earliest
        ? previousStart
        : earliest;
    },
    null,
  );
  return earliestWindow ?? end;
}

export function buildIssueCountChartsFromIssueFacts(
  rows: Array<{
    date: string;
    issue_id: string;
    issue_type: IssueType;
    active_anytime: boolean;
  }>,
) {
  const end = nowSg().startOf('day');
  const rowsByDate = groupIssueFactRowsByDate(
    rows.filter((row) => row.active_anytime),
  );
  const aggregateForRange = (
    rangeStart: DateTime,
    rangeEnd: DateTime,
  ): Record<string, number> => {
    const issueIdsByType: Record<IssueType, Set<string>> = {
      disruption: new Set(),
      maintenance: new Set(),
      infra: new Set(),
    };
    for (
      let dateTime = rangeStart.startOf('day');
      dateTime < rangeEnd;
      dateTime = dateTime.plus({ days: 1 })
    ) {
      const date = dateTime.toFormat('yyyy-MM-dd');
      for (const row of rowsByDate.get(date) ?? []) {
        issueIdsByType[row.issue_type].add(row.issue_id);
      }
    }
    return {
      disruption: issueIdsByType.disruption.size,
      maintenance: issueIdsByType.maintenance.size,
      infra: issueIdsByType.infra.size,
    };
  };

  return STATISTICS_TIME_WINDOWS.map((window) => {
    const start = getWindowStart(end, window.dataTimeScale);
    const data: ChartEntry[] = [];
    for (let offset = 0; offset < window.dataTimeScale.count; offset++) {
      const bucketStart = getDatePlus(
        start,
        window.dataTimeScale.granularity,
        offset,
      );
      const bucketEnd = getBucketEnd(
        bucketStart,
        window.dataTimeScale.granularity,
      );
      data.push({
        name: isoDate(bucketStart),
        payload: aggregateForRange(bucketStart, bucketEnd),
      });
    }

    const currentEnd = getWindowEnd(start, window.dataTimeScale);
    const previousStart = getDateMinus(
      start,
      window.dataTimeScale.granularity,
      window.dataTimeScale.count,
    );
    return buildCountChart(
      window.title,
      data,
      [
        { name: 'current', payload: aggregateForRange(start, currentEnd) },
        { name: 'previous', payload: aggregateForRange(previousStart, start) },
      ],
      window.dataTimeScale,
      window.displayTimeScale,
    );
  });
}

export function buildIssueDurationGraphs(issues: Issue[]) {
  const end = nowSg().startOf('day');
  return STATISTICS_TIME_WINDOWS.map((window) => {
    const start = getWindowStart(end, window.dataTimeScale);
    const { data, cumulative } = buildPreviousWindowSummary(
      issues,
      start,
      window.dataTimeScale.count,
      window.dataTimeScale.granularity,
      true,
    );
    return buildCountChart(
      window.title,
      data,
      cumulative,
      window.dataTimeScale,
      window.displayTimeScale,
    );
  });
}

export function buildDurationChartsFromIssueFacts(rows: IssueDayFactRow[]) {
  const end = nowSg().startOf('day');
  const countsByDate = groupIssueFactCountsByDate(rows, true);
  const aggregateForRange = (
    rangeStart: DateTime,
    rangeEnd: DateTime,
  ): IssueTypeCounts => {
    const aggregate = createIssueTypeCounts();

    for (
      let cursor = rangeStart.startOf('day');
      cursor < rangeEnd;
      cursor = cursor.plus({ days: 1 })
    ) {
      const date = isoDate(cursor);
      const dayCounts = countsByDate.get(date);
      if (dayCounts == null) {
        continue;
      }

      aggregate.disruption += dayCounts.disruption;
      aggregate.maintenance += dayCounts.maintenance;
      aggregate.infra += dayCounts.infra;
    }

    return aggregate;
  };

  return STATISTICS_TIME_WINDOWS.map((window) => {
    const start = getWindowStart(end, window.dataTimeScale);
    const data: ChartEntry[] = [];
    for (let offset = 0; offset < window.dataTimeScale.count; offset++) {
      const bucketStart = getDatePlus(
        start,
        window.dataTimeScale.granularity,
        offset,
      );
      const bucketEnd = getBucketEnd(
        bucketStart,
        window.dataTimeScale.granularity,
      );
      data.push({
        name: isoDate(bucketStart),
        payload: aggregateForRange(bucketStart, bucketEnd),
      });
    }

    const currentEnd = getWindowEnd(start, window.dataTimeScale);
    const previousStart = getDateMinus(
      start,
      window.dataTimeScale.granularity,
      window.dataTimeScale.count,
    );
    return buildCountChart(
      window.title,
      data,
      [
        { name: 'current', payload: aggregateForRange(start, currentEnd) },
        { name: 'previous', payload: aggregateForRange(previousStart, start) },
      ],
      window.dataTimeScale,
      window.displayTimeScale,
    );
  });
}
