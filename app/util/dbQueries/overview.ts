import { timeServerSpan, timeSyncServerSpan } from '~/util/serverTiming';
import { buildAdvisorySummary } from './advisorySummary';
import {
  type CommunitySignalOptions,
  getPageCommunitySignals,
} from './communitySignals';
import { type AppDb, getDefaultDb } from './database';
import type { BaseDataset } from './dataset';
import { nowSg, SG_TIMEZONE } from './dateTime';
import { selectIncludedEntities } from './includedEntities';
import { issueActiveNow, issueActiveToday } from './issueIntervals';
import { getIssuesOverlappingRange } from './issueRange';
import { buildLineSummary, rankLineSummaries } from './lineAnalytics';

type OverviewDataOptions = CommunitySignalOptions & {
  includeStationNames?: boolean;
};

type OverviewDataset = Pick<
  BaseDataset,
  'included' | 'publicHolidaySet' | 'allIssues' | 'issuesByLineId'
>;

async function buildOverviewDataset(
  days: number,
  referenceNow = nowSg(),
  db?: AppDb,
): Promise<OverviewDataset> {
  return timeServerSpan('build_overview_dataset', async () => {
    const database = db ?? (await getDefaultDb());
    const referenceDateTime = referenceNow.setZone(SG_TIMEZONE);
    const rangeStart = referenceDateTime
      .startOf('day')
      .minus({ days: days - 1 });
    const rangeEnd = referenceDateTime.startOf('day').plus({ days: 1 });
    const { dataset } = await timeServerSpan(
      'overview_issue_range_dataset',
      () =>
        getIssuesOverlappingRange(rangeStart, rangeEnd, referenceNow, database),
    );
    return {
      included: dataset.included,
      publicHolidaySet: dataset.publicHolidaySet,
      allIssues: dataset.allIssues,
      issuesByLineId: dataset.issuesByLineId,
    };
  });
}

async function getOverviewDataset(days: number) {
  return buildOverviewDataset(days);
}

export async function getOverviewData(
  days: number,
  options: OverviewDataOptions = {},
) {
  return timeServerSpan('overview_data', async () => {
    const referenceNow = nowSg();
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
        .filter(
          (issue) =>
            issue.type === 'disruption' && issueActiveNow(issue, referenceNow),
        )
        .map((issue) => issue.id),
      issueIdsActiveToday: issues
        .filter(
          (issue) =>
            (issue.type === 'maintenance' || issue.type === 'infra') &&
            issueActiveToday(issue, referenceNow),
        )
        .map((issue) => issue.id),
      advisorySummary: buildAdvisorySummary({ issues, referenceNow }),
      lineSummaries,
      communitySignals: await getPageCommunitySignals(options),
    };

    const overviewIssueIds = [
      ...new Set([
        ...overview.issueIdsActiveNow,
        ...overview.issueIdsActiveToday,
        ...overview.advisorySummary.buckets.flatMap(
          (bucket) => bucket.issueIds,
        ),
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
      stationNames: options.includeStationNames
        ? Object.fromEntries(
            Object.values(dataset.included.stations).map((station) => [
              station.id,
              station.name,
            ]),
          )
        : undefined,
    };
  });
}

export async function getSystemMapData() {
  const overview = await getOverviewData(30, { includeStationNames: true });
  return {
    overview: overview.data,
    included: overview.included,
    stationNames: overview.stationNames ?? {},
  };
}
