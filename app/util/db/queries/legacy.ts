import type { IssueType } from '@mrtdown/core';
import { desc, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import { evidencesTable, statisticsSnapshotsTable } from '~/db/schema';
import type { Issue, LineSummary, LineSummaryStatus } from '~/types';
import { getPublicCrowdReportSignals } from '~/util/crowdReports';
import {
  recordServerTiming,
  timeServerSpan,
  timeSyncServerSpan,
} from '~/util/serverTiming';
import { selectIncludedEntities } from './included';
import { getDefaultDb } from './shared';
import {
  hasFullDateCoverage,
  selectLegacyHistoryFallback,
} from './historyFallback';
import {
  getIssueBounds,
  issueActiveNow,
  issueActiveToday,
  issueOverlapsRange,
  issueTouchesDate,
  sortIssuesByLatestActivity,
} from './issueIntervals';
import {
  addIssueTypeCount,
  createIssueTypeBreakdown,
  createIssueTypeCounts,
  groupIssueFactCountsByDate,
  pickIssueDurationByType,
  pickIssueTypes,
  type IssueTypeBreakdown,
  type IssueTypeCounts,
} from './issueTypeStats';
import { buildLineSummary, rankLineSummaries } from './lineSummaries';
import {
  buildDataset,
  getBaseDataset,
  getIncludedForIssueIds,
  getOverviewDataset,
} from './baseDataset';
import {
  getIssueDayFactsInRange,
  getOperationalFactCoverageDatesInRange,
  getOperationalFactCoverageStart,
} from './operationalFacts';
import {
  getLatestStatisticsSnapshot,
  STATISTICS_SNAPSHOT_ID,
} from './statisticsSnapshots';
import {
  isoDate,
  isoDateTime,
  nowSg,
  parseDateTime,
  SG_TIMEZONE,
} from './temporal';
import {
  buildDurationChartsFromIssueFacts,
  buildIssueCountChartsFromIssueFacts,
  buildIssueCountGraphs,
  buildIssueDurationGraphs,
  buildOperatorUptimeGraph,
  buildStatisticsIssueCountGraphs,
  buildUptimeGraph,
  getStatisticsFactStart,
} from './timeScaleGraphs';
import type {
  BaseDataset,
  CommunitySignalOptions,
  IssueWithOperationalEffects,
  OperatorLinePerformance,
  OperatorOperationalStatus,
  StatisticsSnapshotPayload,
  SystemAnalytics,
} from './types';

async function shouldUseLegacyHistoryFallback(
  start: DateTime,
  end: DateTime,
  context: string,
) {
  const today = nowSg().startOf('day');
  if (end.startOf('day') >= today) {
    return true;
  }

  const coverageEnd = end.startOf('day') < today ? end.startOf('day') : today;
  const coverageRows =
    coverageEnd < start.startOf('day')
      ? []
      : await getOperationalFactCoverageDatesInRange(start, coverageEnd);
  const coverageStart = await getOperationalFactCoverageStart();

  return selectLegacyHistoryFallback(
    start,
    end,
    today,
    coverageRows,
    coverageStart,
    context,
  );
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

async function getPageCommunitySignals(
  options: CommunitySignalOptions,
  scope: { lineId?: string; stationId?: string } = {},
) {
  if (!options.includeCommunitySignals) {
    return [];
  }

  const communitySignalsDb = await getDefaultDb();
  return getPublicCrowdReportSignals(communitySignalsDb, scope);
}

export async function getOverviewData(
  days: number,
  options: CommunitySignalOptions = {},
) {
  return timeServerSpan('overview_data', async () => {
    const dataset = await getOverviewDataset(days);
    const issues = Object.values(dataset.allIssues);
    const lineSummaries = timeSyncServerSpan('overview_line_summaries', () =>
      rankLineSummaries(
        Object.values(dataset.included.lines).map((line) => {
          const lineIssues = dataset.issuesByLineId[line.id] ?? [];
          return buildLineSummary(
            line,
            lineIssues,
            days,
            dataset.publicHolidaySet,
          );
        }),
      ),
    );

    const overview = {
      issueIdsActiveNow: issues
        .filter((issue) => issue.type === 'disruption' && issueActiveNow(issue))
        .map((issue) => issue.id),
      issueIdsActiveToday: issues
        .filter(
          (issue) =>
            (issue.type === 'maintenance' || issue.type === 'infra') &&
            issueActiveToday(issue),
        )
        .map((issue) => issue.id),
      lineSummaries,
      communitySignals: await getPageCommunitySignals(options),
    };

    const overviewIssueIds = [
      ...new Set([
        ...overview.issueIdsActiveNow,
        ...overview.issueIdsActiveToday,
        ...overview.lineSummaries.flatMap((summary) =>
          Object.values(summary.breakdownByDates).flatMap((entry) =>
            Object.values(entry.breakdownByIssueTypes).flatMap(
              (breakdown) => breakdown.issueIds,
            ),
          ),
        ),
      ]),
    ];
    const overviewCommunitySignalStationIds = [
      ...new Set(
        overview.communitySignals.flatMap((signal) => signal.stationIds),
      ),
    ];

    return {
      data: overview,
      included: selectIncludedEntities(dataset.included, dataset.allIssues, {
        issueIds: overviewIssueIds,
        lineIds: overview.lineSummaries.map((summary) => summary.lineId),
        stationIds: overviewCommunitySignalStationIds,
        includeStationMembershipLines: true,
      }),
    };
  });
}

export async function getLineProfileData(
  lineId: string,
  days: number,
  options: CommunitySignalOptions = {},
) {
  const dataset = await getBaseDataset();
  const line = dataset.included.lines[lineId];
  if (line == null) {
    throw new Response('Line not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const allLineSummaries = rankLineSummaries(
    Object.values(dataset.included.lines).map((candidateLine) => {
      const candidateIssues = dataset.issuesByLineId[candidateLine.id] ?? [];
      return buildLineSummary(
        candidateLine,
        candidateIssues,
        days,
        dataset.publicHolidaySet,
      );
    }),
  );

  const lineIssues = dataset.issuesByLineId[lineId] ?? [];
  const rankedSummary = allLineSummaries.find(
    (summary) => summary.lineId === lineId,
  );
  if (rankedSummary == null) {
    throw new Response('Line not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }
  const issueIdsRecent = [...lineIssues]
    .filter((issue) =>
      issue.intervals.some(
        (interval) => parseDateTime(interval.startAt) <= nowSg(),
      ),
    )
    .sort((a, b) => {
      const earliestA = Math.min(
        ...a.intervals.map((interval) =>
          parseDateTime(interval.startAt).toMillis(),
        ),
      );
      const earliestB = Math.min(
        ...b.intervals.map((interval) =>
          parseDateTime(interval.startAt).toMillis(),
        ),
      );
      return earliestB - earliestA;
    })
    .slice(0, 5)
    .map((issue) => issue.id);

  const futureMaintenance = lineIssues
    .filter((issue) => issue.type === 'maintenance')
    .flatMap((issue) =>
      issue.intervals
        .filter((interval) => interval.status === 'future')
        .map((interval) => ({ issueId: issue.id, startAt: interval.startAt })),
    )
    .sort(
      (a, b) =>
        parseDateTime(a.startAt).toMillis() -
        parseDateTime(b.startAt).toMillis(),
    )[0];

  const stationIdsInterchanges = [
    ...new Set(
      Object.values(dataset.included.stations)
        .filter((station) => {
          const lineMemberships = station.memberships.filter(
            (membership) => membership.lineId === lineId,
          );
          if (lineMemberships.length === 0) {
            return false;
          }

          return station.memberships.some(
            (membership) => membership.lineId !== lineId,
          );
        })
        .map((station) => station.id),
    ),
  ];

  const profile = {
    lineId,
    lineSummary: rankedSummary,
    branches: dataset.branchesByLineId[lineId] ?? [],
    issueIdNextMaintenance: futureMaintenance?.issueId ?? null,
    issueIdsRecent,
    issueCountByType: pickIssueTypes(lineIssues),
    timeScaleGraphsIssueCount: buildIssueCountGraphs(lineIssues),
    timeScaleGraphsUptimeRatios: [7, 30, days].map((window) =>
      buildUptimeGraph(line, lineIssues, dataset.publicHolidaySet, window),
    ),
    stationIdsInterchanges,
    communitySignals: await getPageCommunitySignals(options, { lineId }),
  };
  const profileIssueIds = [
    ...new Set(
      [...issueIdsRecent, profile.issueIdNextMaintenance].filter(
        (value): value is string => value != null,
      ),
    ),
  ];

  return {
    data: profile,
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: profileIssueIds,
      lineIds: [lineId],
      stationIds: Object.keys(dataset.included.stations),
      operatorIds: line.operators.map((operator) => operator.operatorId),
      includeStationMembershipLines: true,
    }),
  };
}

export async function getIssueData(issueId: string) {
  const db = await getDefaultDb();
  const [dataset, evidenceRows] = await Promise.all([
    getBaseDataset(),
    db
      .select()
      .from(evidencesTable)
      .where(eq(evidencesTable.issue_id, issueId))
      .orderBy(desc(evidencesTable.ts)),
  ]);
  const issue = dataset.allIssues[issueId];
  if (issue == null) {
    throw new Response('Issue not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  return {
    data: {
      id: issueId,
      updates: evidenceRows.map((evidence) => ({
        type: evidence.type,
        text: evidence.text,
        textTranslations: evidence.render?.text ?? null,
        sourceUrl: evidence.source_url,
        createdAt: evidence.ts,
      })),
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: [issueId],
      includeStationMembershipLines: true,
    }),
  };
}

export async function getStationProfileData(
  stationId: string,
  options: CommunitySignalOptions = {},
) {
  const dataset = await getBaseDataset();
  const station = dataset.included.stations[stationId];
  if (station == null) {
    throw new Response('Station not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const issues = Object.values(dataset.allIssues).filter((issue) =>
    issue.branchesAffected.some((branch) =>
      branch.stationIds.includes(stationId),
    ),
  );
  const activeNow = issues.filter((issue) => issueActiveNow(issue));

  let status: LineSummaryStatus = 'normal';
  if (activeNow.some((issue) => issue.type === 'disruption')) {
    status = 'ongoing_disruption';
  } else if (activeNow.some((issue) => issue.type === 'maintenance')) {
    status = 'ongoing_maintenance';
  } else if (activeNow.some((issue) => issue.type === 'infra')) {
    status = 'ongoing_infra';
  }

  const issueIdsRecent = sortIssuesByLatestActivity(
    issues.map((issue) => issue.id),
    dataset.allIssues,
  ).slice(0, 15);
  const communitySignals = await getPageCommunitySignals(options, {
    stationId,
  });

  return {
    data: {
      stationId,
      status,
      issueIdsRecent,
      issueCountByType: pickIssueTypes(issues),
      communitySignals,
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: issueIdsRecent,
      lineIds: [
        ...new Set(communitySignals.flatMap((signal) => signal.lineIds)),
      ],
      stationIds: [
        stationId,
        ...new Set(communitySignals.flatMap((signal) => signal.stationIds)),
      ],
      includeStationDetailEntities: true,
      includeStationMembershipLines: true,
    }),
  };
}

export async function getOperatorProfileData(operatorId: string, days: number) {
  const dataset = await getBaseDataset();
  const operator = dataset.included.operators[operatorId];
  if (operator == null) {
    throw new Response('Operator not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const lineIds = Object.values(dataset.included.lines)
    .filter((line) =>
      line.operators.some((entry) => entry.operatorId === operatorId),
    )
    .map((line) => line.id);
  const lineIdSet = new Set(lineIds);

  const lineSummaries = Object.fromEntries(
    lineIds.map((lineId) => {
      const line = dataset.included.lines[lineId];
      const lineIssues = dataset.issuesByLineId[lineId] ?? [];
      return [
        lineId,
        buildLineSummary(line, lineIssues, days, dataset.publicHolidaySet),
      ];
    }),
  ) as Record<string, LineSummary>;
  const operatorLines = lineIds.map((lineId) => dataset.included.lines[lineId]);
  const operatorIssuesByLineId = Object.fromEntries(
    lineIds.map((lineId) => [lineId, dataset.issuesByLineId[lineId] ?? []]),
  ) as Record<string, IssueWithOperationalEffects[]>;

  const operatorIssues = Object.values(dataset.allIssues).filter((issue) =>
    issue.lineIds.some((lineId) => lineIdSet.has(lineId)),
  );

  const totalStationsOperated = new Set(
    lineIds.flatMap((lineId) =>
      (dataset.branchesByLineId[lineId] ?? []).flatMap(
        (branch) => branch.stationIds,
      ),
    ),
  ).size;

  const linePerformanceComparison: OperatorLinePerformance[] = lineIds.map(
    (lineId) => ({
      lineId,
      status: lineSummaries[lineId].status,
      uptimeRatio: lineSummaries[lineId].uptimeRatio,
      issueCount: (operatorIssuesByLineId[lineId] ?? []).length,
    }),
  );

  const activeSummaries = Object.values(lineSummaries);
  const linesAffected = activeSummaries
    .filter((summary) =>
      ['ongoing_disruption', 'ongoing_maintenance', 'ongoing_infra'].includes(
        summary.status,
      ),
    )
    .map((summary) => summary.lineId);

  let currentOperationalStatus: OperatorOperationalStatus = 'all_operational';
  if (
    activeSummaries.length > 0 &&
    activeSummaries.every((summary) =>
      ['closed_for_day', 'future_service'].includes(summary.status),
    )
  ) {
    currentOperationalStatus = 'all_lines_closed_for_day';
  } else if (
    activeSummaries.some((summary) => summary.status === 'ongoing_disruption')
  ) {
    currentOperationalStatus = 'some_lines_disrupted';
  } else if (
    activeSummaries.some((summary) =>
      ['ongoing_maintenance', 'ongoing_infra'].includes(summary.status),
    )
  ) {
    currentOperationalStatus = 'some_lines_under_maintenance';
  }

  const totalServiceSeconds = activeSummaries.reduce(
    (sum, summary) => sum + (summary.totalServiceSeconds ?? 0),
    0,
  );
  const totalDowntimeSeconds = activeSummaries.reduce(
    (sum, summary) => sum + (summary.totalDowntimeSeconds ?? 0),
    0,
  );

  const profile = {
    operatorId,
    lineIds,
    aggregateUptimeRatio:
      totalServiceSeconds > 0
        ? Math.max(0, 1 - totalDowntimeSeconds / totalServiceSeconds)
        : null,
    currentOperationalStatus,
    linesAffected,
    totalIssuesByType: pickIssueTypes(operatorIssues),
    totalStationsOperated,
    issueIdsRecent: sortIssuesByLatestActivity(
      operatorIssues.map((issue) => issue.id),
      dataset.allIssues,
    ).slice(0, 15),
    timeScaleGraphsIssueCount: buildIssueCountGraphs(operatorIssues),
    timeScaleGraphsUptimeRatios: [7, 30, days].map((window) =>
      buildOperatorUptimeGraph(
        operatorLines,
        operatorIssuesByLineId,
        dataset.publicHolidaySet,
        window,
      ),
    ),
    linePerformanceComparison,
    totalDowntimeDurationSeconds: totalDowntimeSeconds,
    downtimeDurationByIssueType: pickIssueDurationByType(operatorIssues),
    yearsOfOperation: Math.max(
      0,
      Math.floor(
        nowSg().diff(parseDateTime(operator.foundedAt), 'years').years,
      ),
    ),
  };

  return {
    data: profile,
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: profile.issueIdsRecent,
      lineIds: profile.lineIds,
      operatorIds: [operatorId],
      includeStationMembershipLines: true,
    }),
  };
}

export async function getHistoryYearSummaryData(year: number) {
  const yearStart = DateTime.fromObject(
    { year, month: 1, day: 1 },
    { zone: SG_TIMEZONE },
  ).startOf('day');
  const yearEnd = yearStart.plus({ years: 1 });
  const factRows = await getIssueDayFactsInRange(
    yearStart,
    yearEnd.minus({ days: 1 }),
  );
  if (
    await shouldUseLegacyHistoryFallback(
      yearStart,
      yearEnd.minus({ days: 1 }),
      `history year ${year}`,
    )
  ) {
    const dataset = await getBaseDataset();
    const issues = Object.values(dataset.allIssues).filter((issue) =>
      issueOverlapsRange(issue, yearStart, yearEnd),
    );

    const summaryByMonth = Array.from({ length: 12 }, (_, index) => {
      const monthStart = DateTime.fromObject(
        { year, month: index + 1, day: 1 },
        { zone: SG_TIMEZONE },
      ).startOf('day');
      const monthEnd = monthStart.plus({ months: 1 });
      const monthIssues = issues.filter((issue) =>
        issueOverlapsRange(issue, monthStart, monthEnd),
      );
      return {
        month: isoDate(monthStart),
        issueCountsByType: pickIssueTypes(monthIssues),
        totalCount: monthIssues.length,
      };
    }).reverse();

    return {
      data: {
        startAt: isoDate(yearStart),
        endAt: isoDate(yearEnd.minus({ day: 1 })),
        summaryByMonth,
      },
      included: selectIncludedEntities(dataset.included, dataset.allIssues, {
        issueIds: issues.map((issue) => issue.id),
        includeStationMembershipLines: true,
      }),
    };
  }
  const issueIds = [...new Set(factRows.map((row) => row.issue_id))];
  const included = await getIncludedForIssueIds(issueIds);
  const uniqueIssuesByMonth = Array.from(
    { length: 12 },
    () => new Map<string, IssueType>(),
  );

  for (const row of factRows) {
    const date = parseDateTime(row.date);
    uniqueIssuesByMonth[date.month - 1]?.set(
      row.issue_id,
      row.issue_type as IssueType,
    );
  }

  const summaryByMonth = Array.from({ length: 12 }, (_, index) => {
    const monthStart = DateTime.fromObject(
      { year, month: index + 1, day: 1 },
      { zone: SG_TIMEZONE },
    ).startOf('day');
    const uniqueIssues =
      uniqueIssuesByMonth[index] ?? new Map<string, IssueType>();
    const issueCountsByType = [...uniqueIssues.values()].reduce<
      Partial<Record<IssueType, number>>
    >((acc, type) => {
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
    return {
      month: isoDate(monthStart),
      issueCountsByType,
      totalCount: uniqueIssues.size,
    };
  }).reverse();

  return {
    data: {
      startAt: isoDate(yearStart),
      endAt: isoDate(yearEnd.minus({ day: 1 })),
      summaryByMonth,
    },
    included,
  };
}

export async function getHistoryYearMonthData(year: number, month: number) {
  const monthStart = DateTime.fromObject(
    { year, month, day: 1 },
    { zone: SG_TIMEZONE },
  ).startOf('day');
  const monthEnd = monthStart.plus({ months: 1 });
  const factRows = await getIssueDayFactsInRange(
    monthStart,
    monthEnd.minus({ days: 1 }),
  );
  if (
    await shouldUseLegacyHistoryFallback(
      monthStart,
      monthEnd.minus({ days: 1 }),
      `history month ${year}-${month.toString().padStart(2, '0')}`,
    )
  ) {
    const dataset = await getBaseDataset();

    const issues = Object.values(dataset.allIssues).filter((issue) =>
      issueOverlapsRange(issue, monthStart, monthEnd),
    );

    const weeks = new Map<string, string[]>();
    for (
      let date = monthStart.startOf('week');
      date < monthEnd.endOf('week');
      date = date.plus({ week: 1 })
    ) {
      const key = `${date.weekYear}-W${date.weekNumber.toString().padStart(2, '0')}`;
      const issueIds = issues
        .filter((issue) =>
          issueOverlapsRange(
            issue,
            date.startOf('week'),
            date.startOf('week').plus({ week: 1 }),
          ),
        )
        .map((issue) => issue.id)
        .sort((a, b) => b.localeCompare(a));
      if (issueIds.length > 0 || !weeks.has(key)) {
        weeks.set(key, issueIds);
      }
    }

    return {
      data: {
        startAt: isoDate(monthStart),
        endAt: isoDate(monthEnd.minus({ day: 1 })),
        issuesByWeek: [...weeks.entries()]
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([week, issueIds]) => ({
            week,
            issueIds,
          })),
      },
      included: selectIncludedEntities(dataset.included, dataset.allIssues, {
        issueIds: issues.map((issue) => issue.id),
        includeStationMembershipLines: true,
      }),
    };
  }
  const issueIds = [...new Set(factRows.map((row) => row.issue_id))];
  const included = await getIncludedForIssueIds(issueIds);
  const weeks = new Map<string, Set<string>>();

  for (
    let date = monthStart.startOf('week');
    date < monthEnd.endOf('week');
    date = date.plus({ week: 1 })
  ) {
    const key = `${date.weekYear}-W${date.weekNumber.toString().padStart(2, '0')}`;
    weeks.set(key, new Set());
  }

  for (const row of factRows) {
    const date = parseDateTime(row.date);
    const key = `${date.weekYear}-W${date.weekNumber.toString().padStart(2, '0')}`;
    const issueIdsForWeek = weeks.get(key);
    if (issueIdsForWeek != null) {
      issueIdsForWeek.add(row.issue_id);
    }
  }

  return {
    data: {
      startAt: isoDate(monthStart),
      endAt: isoDate(monthEnd.minus({ day: 1 })),
      issuesByWeek: [...weeks.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([week, ids]) => ({
          week,
          issueIds: [...ids].sort((a, b) => b.localeCompare(a)),
        })),
    },
    included,
  };
}

export async function getHistoryDayData(
  year: number,
  month: number,
  day: number,
) {
  const date = DateTime.fromObject({ year, month, day }, { zone: SG_TIMEZONE });
  const factRows = await getIssueDayFactsInRange(date, date);
  if (await shouldUseLegacyHistoryFallback(date, date, `history day ${date}`)) {
    const dataset = await getBaseDataset();
    const issues = Object.values(dataset.allIssues).filter((issue) =>
      issueTouchesDate(issue, date),
    );
    const issueIds = issues
      .map((issue) => issue.id)
      .sort((a, b) => b.localeCompare(a));

    return {
      data: {
        startAt: isoDate(date),
        endAt: isoDate(date),
        issueIds,
      },
      included: selectIncludedEntities(dataset.included, dataset.allIssues, {
        issueIds,
        includeStationMembershipLines: true,
      }),
    };
  }
  const issueIds = [...new Set(factRows.map((row) => row.issue_id))].sort(
    (a, b) => b.localeCompare(a),
  );
  const included = await getIncludedForIssueIds(issueIds);

  return {
    data: {
      startAt: isoDate(date),
      endAt: isoDate(date),
      issueIds,
    },
    included,
  };
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
            updated_at: asOf,
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
    if (snapshot != null) {
      if (snapshot.included != null) {
        recordServerTiming('statistics_included', 0, 'source=snapshot');
        return {
          data: snapshot.data,
          included: snapshot.included,
        };
      }

      const dataset = await timeServerSpan('statistics_included_dataset', () =>
        buildDataset(
          nowSg(),
          undefined,
          snapshot.data.issueIdsDisruptionLongest,
        ),
      );
      return {
        data: snapshot.data,
        included: timeSyncServerSpan('statistics_included', () =>
          getStatisticsIncluded(dataset, snapshot.data),
        ),
      };
    }

    const dataset = await getBaseDataset();
    const statistics = await buildStatisticsDataFromDataset(dataset);
    return {
      data: statistics,
      included: timeSyncServerSpan('statistics_included', () =>
        getStatisticsIncluded(dataset, statistics),
      ),
    };
  });
}

export type LineBranch = Awaited<
  ReturnType<typeof getLineProfileData>
>['data']['branches'][number];

export type OperatorProfile = Awaited<
  ReturnType<typeof getOperatorProfileData>
>['data'];
