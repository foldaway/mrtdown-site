import type { IssueType } from '@mrtdown/core';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import {
  issueDayFactsTable,
  lineDayFactsTable,
  statisticsSnapshotsTable,
} from '~/db/schema';
import type {
  ChartEntry,
  IncludedEntities,
  Issue,
  TimeScaleChart,
} from '~/types';
import {
  recordServerTiming,
  timeServerSpan,
  timeSyncServerSpan,
} from '~/util/serverTiming';
import {
  buildCountChart,
  type IssueDayFactRow,
  makeTimeScale,
  type TimeScale,
} from './analyticsShared';
import { type AppDb, getDefaultDb, isUndefinedTableError } from './database';
import { type BaseDataset, buildDataset } from './dataset';
import { isoDate, isoDateTime, nowSg } from './dateTime';
import { selectIncludedEntities } from './includedEntities';
import {
  addIssueTypeCount,
  createIssueTypeBreakdown,
  createIssueTypeCounts,
  emptyIssueTypePayload,
  groupIssueFactCountsByDate,
  groupIssueFactRowsByDate,
  type IssueTypeBreakdown,
  type IssueTypeCounts,
} from './issueAnalytics';
import { getIssueBounds, issueOverlapsRange } from './issueIntervals';
import {
  buildPreviousWindowSummary,
  getBucketEnd,
  getDateMinus,
  getDatePlus,
  getWindowEnd,
  getWindowStart,
} from './lineAnalytics';

export type SystemAnalytics = {
  timeScaleChartsIssueCount: TimeScaleChart[];
  timeScaleChartsIssueDuration: TimeScaleChart[];
  chartTotalIssueCountByLine: {
    title: string;
    data: ChartEntry[];
  };
  chartTotalIssueCountByStation: {
    title: string;
    data: ChartEntry[];
  };
  chartRollingYearHeatmap: {
    title: string;
    data: ChartEntry[];
  };
  issueIdsDisruptionLongest: string[];
};

type StatisticsSnapshotPayload = {
  kind: 'statistics_snapshot.v1';
  data: SystemAnalytics;
  included: IncludedEntities;
};

type StatisticsTimeWindow = {
  title: string;
  dataTimeScale: TimeScale;
  displayTimeScale?: TimeScale;
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

function buildStatisticsIssueCountGraphs(issues: Issue[]) {
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

function getStatisticsFactStart(end: DateTime) {
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

function buildIssueCountChartsFromIssueFacts(
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

function buildIssueDurationGraphs(issues: Issue[]) {
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

function buildDurationChartsFromIssueFacts(rows: IssueDayFactRow[]) {
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

async function getIssueDayFactsInRange(
  start: DateTime,
  end: DateTime,
  db?: AppDb,
) {
  const database = db ?? (await getDefaultDb());
  try {
    return await timeServerSpan('fact_issue_day_query', () =>
      database
        .select({
          date: issueDayFactsTable.date,
          issue_id: issueDayFactsTable.issue_id,
          issue_type: issueDayFactsTable.issue_type,
          active_anytime: issueDayFactsTable.active_anytime,
          duration_seconds: issueDayFactsTable.duration_seconds,
        })
        .from(issueDayFactsTable)
        .where(
          and(
            gte(issueDayFactsTable.date, isoDate(start)),
            lte(issueDayFactsTable.date, isoDate(end)),
          ),
        ),
    );
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return [];
    }
    throw error;
  }
}

async function getOperationalFactCoverageDatesInRange(
  start: DateTime,
  end: DateTime,
  db?: AppDb,
) {
  const database = db ?? (await getDefaultDb());
  try {
    return await timeServerSpan('fact_coverage_query', () =>
      database
        .select({
          date: lineDayFactsTable.date,
        })
        .from(lineDayFactsTable)
        .where(
          and(
            gte(lineDayFactsTable.date, isoDate(start)),
            lte(lineDayFactsTable.date, isoDate(end)),
          ),
        )
        .groupBy(lineDayFactsTable.date),
    );
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return [];
    }
    throw error;
  }
}

function hasFullDateCoverage(
  rows: Array<{ date: string }>,
  start: DateTime,
  end: DateTime,
) {
  const expectedDays =
    Math.floor(end.startOf('day').diff(start.startOf('day'), 'days').days) + 1;
  if (expectedDays <= 0) {
    return false;
  }

  const dates = new Set(rows.map((row) => row.date));
  return dates.size === expectedDays;
}

function buildDailyIssueTypeCountsFromIssues(
  issues: Issue[],
  start: DateTime,
  end: DateTime,
) {
  const countsByDate = new Map<string, IssueTypeCounts>();
  const rangeStart = start.startOf('day');
  const rangeEndExclusive = end.startOf('day').plus({ days: 1 });

  for (const issue of issues) {
    const touchedDates = new Set<string>();

    for (const interval of getIssueBounds(issue)) {
      const boundedStart =
        interval.start > rangeStart ? interval.start : rangeStart;
      const rawEnd = interval.end ?? nowSg();
      const boundedEnd =
        rawEnd < rangeEndExclusive ? rawEnd : rangeEndExclusive;

      if (boundedStart >= boundedEnd) {
        continue;
      }

      for (
        let cursor = boundedStart.startOf('day');
        cursor < boundedEnd;
        cursor = cursor.plus({ days: 1 })
      ) {
        touchedDates.add(isoDate(cursor));
      }
    }

    for (const date of touchedDates) {
      let counts = countsByDate.get(date);
      if (counts == null) {
        counts = createIssueTypeCounts();
        countsByDate.set(date, counts);
      }

      addIssueTypeCount(counts, issue.type, 1);
    }
  }

  return countsByDate;
}

const STATISTICS_SNAPSHOT_ID = 'latest';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isSystemAnalytics(value: unknown): value is SystemAnalytics {
  return (
    isRecord(value) &&
    Array.isArray(
      (value as Partial<SystemAnalytics>).timeScaleChartsIssueCount,
    ) &&
    Array.isArray(
      (value as Partial<SystemAnalytics>).timeScaleChartsIssueDuration,
    ) &&
    Array.isArray(
      (value as Partial<SystemAnalytics>).chartTotalIssueCountByLine?.data,
    ) &&
    Array.isArray(
      (value as Partial<SystemAnalytics>).chartTotalIssueCountByStation?.data,
    ) &&
    Array.isArray(
      (value as Partial<SystemAnalytics>).chartRollingYearHeatmap?.data,
    ) &&
    Array.isArray((value as Partial<SystemAnalytics>).issueIdsDisruptionLongest)
  );
}

function isIncludedEntities(value: unknown): value is IncludedEntities {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRecord(value.issues) &&
    isRecord(value.lines) &&
    isRecord(value.stations) &&
    isRecord(value.operators) &&
    isRecord(value.towns) &&
    isRecord(value.landmarks)
  );
}

function isStatisticsSnapshotPayload(
  value: unknown,
): value is StatisticsSnapshotPayload {
  return (
    isRecord(value) &&
    value.kind === 'statistics_snapshot.v1' &&
    isSystemAnalytics(value.data) &&
    isIncludedEntities(value.included)
  );
}

export function parseStatisticsSnapshotPayload(value: unknown): {
  data: SystemAnalytics;
  included: IncludedEntities | null;
} | null {
  if (isStatisticsSnapshotPayload(value)) {
    return {
      data: value.data,
      included: value.included,
    };
  }

  if (isSystemAnalytics(value)) {
    return {
      data: value,
      included: null,
    };
  }

  return null;
}

export function assertCompleteStatisticsSnapshot(
  snapshot: ReturnType<typeof parseStatisticsSnapshotPayload>,
): asserts snapshot is {
  data: SystemAnalytics;
  included: IncludedEntities;
} {
  if (snapshot?.included == null) {
    throw new Error(
      'Statistics snapshot is missing or incomplete. Apply database migrations, then run the canonical data pull or POST /internal/api/tasks/facts before serving /statistics.',
    );
  }
}

async function getLatestStatisticsSnapshot(db?: AppDb) {
  const database = db ?? (await getDefaultDb());
  try {
    const [snapshot] = await timeServerSpan('statistics_snapshot_query', () =>
      database
        .select({
          data: statisticsSnapshotsTable.data,
        })
        .from(statisticsSnapshotsTable)
        .where(eq(statisticsSnapshotsTable.id, STATISTICS_SNAPSHOT_ID))
        .limit(1),
    );
    return parseStatisticsSnapshotPayload(snapshot?.data);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return null;
    }
    throw error;
  }
}

function getStatisticsIncluded(
  dataset: BaseDataset,
  statistics: SystemAnalytics,
) {
  return selectIncludedEntities(dataset.included, dataset.allIssues, {
    issueIds: statistics.issueIdsDisruptionLongest,
    lineIds: statistics.chartTotalIssueCountByLine.data.map(
      (entry) => entry.name,
    ),
    stationIds: statistics.chartTotalIssueCountByStation.data.map(
      (entry) => entry.name,
    ),
    includeStationMembershipLines: true,
  });
}

async function buildStatisticsDataFromDataset(
  dataset: BaseDataset,
  db?: AppDb,
) {
  return timeServerSpan('statistics_build', async () => {
    const issues = Object.values(dataset.allIssues);
    const rollingYearEnd = nowSg().startOf('day');
    const rollingYearStart = rollingYearEnd.minus({ days: 364 });
    const statisticsFactStart = getStatisticsFactStart(rollingYearEnd);
    const issueFactRows = await getIssueDayFactsInRange(
      statisticsFactStart,
      rollingYearEnd,
      db,
    );
    const rollingYearFactCoverageRows =
      await getOperationalFactCoverageDatesInRange(
        rollingYearStart,
        rollingYearEnd,
        db,
      );
    const statisticsFactCoverageRows =
      await getOperationalFactCoverageDatesInRange(
        statisticsFactStart,
        rollingYearEnd,
        db,
      );
    const hasRollingYearIssueFactCoverage = hasFullDateCoverage(
      rollingYearFactCoverageRows,
      rollingYearStart,
      rollingYearEnd,
    );
    const hasStatisticsIssueFactCoverage = hasFullDateCoverage(
      statisticsFactCoverageRows,
      statisticsFactStart,
      rollingYearEnd,
    );
    const { lineCountsById, stationCountsById } = timeSyncServerSpan(
      'statistics_entity_counts',
      () => {
        const lineCountsById: Record<string, IssueTypeBreakdown> = {};
        const stationCountsById: Record<string, IssueTypeBreakdown> = {};

        for (const issue of issues) {
          for (const lineId of new Set(issue.lineIds)) {
            lineCountsById[lineId] ??= createIssueTypeBreakdown();
            const counts = lineCountsById[lineId];
            addIssueTypeCount(counts, issue.type, 1);
            counts.totalIssues += 1;
          }

          const stationIds = new Set(
            issue.branchesAffected.flatMap((branch) => branch.stationIds),
          );
          for (const stationId of stationIds) {
            stationCountsById[stationId] ??= createIssueTypeBreakdown();
            const counts = stationCountsById[stationId];
            addIssueTypeCount(counts, issue.type, 1);
            counts.totalIssues += 1;
          }
        }

        return { lineCountsById, stationCountsById };
      },
    );

    const longestDisruptions = timeSyncServerSpan(
      'statistics_longest_disruptions',
      () =>
        [...issues]
          .filter((issue) => issue.type === 'disruption')
          .sort((a, b) => b.durationSeconds - a.durationSeconds)
          .slice(0, 10)
          .map((issue) => issue.id),
    );

    const chartTotalIssueCountByLine = timeSyncServerSpan(
      'statistics_line_chart',
      () => ({
        title: 'Issue Count by Line',
        data: Object.values(dataset.included.lines).map((line) => {
          const counts = lineCountsById[line.id] ?? createIssueTypeBreakdown();
          return {
            name: line.id,
            payload: {
              disruption: counts.disruption,
              maintenance: counts.maintenance,
              infra: counts.infra,
              totalIssues: counts.totalIssues,
            },
          };
        }),
      }),
    );

    const stationIssueCounts = timeSyncServerSpan(
      'statistics_station_counts',
      () =>
        Object.values(dataset.included.stations).map((station) => {
          const counts =
            stationCountsById[station.id] ?? createIssueTypeBreakdown();
          return {
            name: station.id,
            payload: {
              disruption: counts.disruption,
              maintenance: counts.maintenance,
              infra: counts.infra,
              totalIssues: counts.totalIssues,
            },
          };
        }),
    );

    const heatmapCountsByDate = timeSyncServerSpan(
      'statistics_heatmap_counts',
      () =>
        hasRollingYearIssueFactCoverage
          ? groupIssueFactCountsByDate(issueFactRows)
          : buildDailyIssueTypeCountsFromIssues(
              issues,
              rollingYearStart,
              rollingYearEnd,
            ),
    );

    const topStationIssueCounts = timeSyncServerSpan(
      'statistics_top_station_counts',
      () =>
        stationIssueCounts
          .sort(
            (a, b) =>
              (b.payload.totalIssues as number) -
              (a.payload.totalIssues as number),
          )
          .slice(0, 15),
    );

    const chartTotalIssueCountByStation = timeSyncServerSpan(
      'statistics_station_chart',
      () => ({
        title: 'Issue Count by Station',
        data: topStationIssueCounts,
      }),
    );

    const chartRollingYearHeatmap = timeSyncServerSpan(
      'statistics_heatmap_chart',
      () => ({
        title: 'Rolling Year Heatmap',
        data: Array.from({ length: 365 }, (_, index) => {
          const date = isoDate(rollingYearStart.plus({ days: index }));
          return {
            name: date,
            payload: {
              ...(heatmapCountsByDate.get(date) ?? createIssueTypeCounts()),
            },
          };
        }),
      }),
    );

    return {
      timeScaleChartsIssueCount: timeSyncServerSpan(
        'statistics_count_charts',
        () =>
          hasStatisticsIssueFactCoverage
            ? buildIssueCountChartsFromIssueFacts(issueFactRows)
            : buildStatisticsIssueCountGraphs(issues),
      ),
      timeScaleChartsIssueDuration: timeSyncServerSpan(
        'statistics_duration_charts',
        () =>
          hasStatisticsIssueFactCoverage
            ? buildDurationChartsFromIssueFacts(issueFactRows)
            : buildIssueDurationGraphs(issues),
      ),
      chartTotalIssueCountByLine,
      chartTotalIssueCountByStation,
      chartRollingYearHeatmap,
      issueIdsDisruptionLongest: longestDisruptions,
    } satisfies SystemAnalytics;
  });
}

export async function rebuildStatisticsSnapshot(db?: AppDb) {
  return timeServerSpan('statistics_snapshot_rebuild', async () => {
    const database = db ?? (await getDefaultDb());
    const asOf = isoDateTime(nowSg());
    const dataset = await buildDataset(nowSg(), database);
    const data = await buildStatisticsDataFromDataset(dataset, database);
    const included = timeSyncServerSpan('statistics_snapshot_included', () =>
      getStatisticsIncluded(dataset, data),
    );
    const snapshotPayload = {
      kind: 'statistics_snapshot.v1',
      data,
      included,
    } satisfies StatisticsSnapshotPayload;
    await timeServerSpan('statistics_snapshot_upsert', () =>
      database
        .insert(statisticsSnapshotsTable)
        .values({
          id: STATISTICS_SNAPSHOT_ID,
          as_of: asOf,
          data: snapshotPayload,
        })
        .onConflictDoUpdate({
          target: [statisticsSnapshotsTable.id],
          set: {
            as_of: asOf,
            data: snapshotPayload,
            updated_at: sql`now()`,
          },
        }),
    );
    return {
      asOf,
      issueIdsDisruptionLongest: data.issueIdsDisruptionLongest,
    };
  });
}

export async function getStatisticsData() {
  return timeServerSpan('statistics_data', async () => {
    const snapshot = await getLatestStatisticsSnapshot();
    assertCompleteStatisticsSnapshot(snapshot);
    recordServerTiming('statistics_included', 0, 'source=snapshot');
    return {
      data: snapshot.data,
      included: snapshot.included,
    };
  });
}
