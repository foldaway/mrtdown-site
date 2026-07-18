import type { LineSummary, LineSummaryStatus } from '~/types';
import { getCompleteDataset } from './dataset';
import { nowSg, parseDateTime } from './dateTime';
import { selectIncludedEntities } from './includedEntities';
import { pickIssueDurationByType, pickIssueTypes } from './issueAnalytics';
import {
  type IssueWithOperationalEffects,
  sortIssuesByLatestActivity,
} from './issueIntervals';
import {
  buildIssueCountGraphs,
  buildLineSummary,
  buildOperatorUptimeGraph,
} from './lineAnalytics';

type OperatorOperationalStatus =
  | 'all_operational'
  | 'some_lines_disrupted'
  | 'some_lines_under_maintenance'
  | 'all_lines_closed_for_day';

type OperatorLinePerformance = {
  lineId: string;
  status: LineSummaryStatus;
  uptimeRatio: number | null;
  issueCount: number;
};

export async function getOperatorProfileData(operatorId: string, days: number) {
  const dataset = await getCompleteDataset();
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

export type OperatorProfile = Awaited<
  ReturnType<typeof getOperatorProfileData>
>['data'];
