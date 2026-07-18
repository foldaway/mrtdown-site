import { eq, inArray, or } from 'drizzle-orm';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  lineOperatorsTable,
  operatorsTable,
  serviceRevisionPathStationEntriesTable,
  servicesTable,
  stationCodesTable,
} from '~/db/schema';
import type { LineSummary, LineSummaryStatus } from '~/types';
import { getDefaultDb, timeDbQuery } from './database';
import { buildDataset } from './dataset';
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
import { getIssueStaticScope } from './readModelScope';

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

async function getOperatorCandidateIssueIds(
  lineIds: readonly string[],
  serviceIds: readonly string[],
  stationIds: readonly string[],
  db: Awaited<ReturnType<typeof getDefaultDb>>,
) {
  const facilityCondition =
    lineIds.length > 0 && stationIds.length > 0
      ? or(
          inArray(impactEventEntityFacilitiesTable.line_id, lineIds),
          inArray(impactEventEntityFacilitiesTable.station_id, stationIds),
        )
      : lineIds.length > 0
        ? inArray(impactEventEntityFacilitiesTable.line_id, lineIds)
        : stationIds.length > 0
          ? inArray(impactEventEntityFacilitiesTable.station_id, stationIds)
          : null;
  const [serviceIssueRows, facilityIssueRows] = await Promise.all([
    serviceIds.length > 0
      ? timeDbQuery('operator_profile_q_service_issues', () =>
          db
            .selectDistinct({ issueId: impactEventsTable.issue_id })
            .from(impactEventsTable)
            .innerJoin(
              impactEventEntityServicesTable,
              eq(
                impactEventEntityServicesTable.impact_event_id,
                impactEventsTable.id,
              ),
            )
            .where(
              inArray(impactEventEntityServicesTable.service_id, serviceIds),
            ),
        )
      : [],
    facilityCondition == null
      ? []
      : timeDbQuery('operator_profile_q_facility_issues', () =>
          db
            .selectDistinct({ issueId: impactEventsTable.issue_id })
            .from(impactEventsTable)
            .innerJoin(
              impactEventEntityFacilitiesTable,
              eq(
                impactEventEntityFacilitiesTable.impact_event_id,
                impactEventsTable.id,
              ),
            )
            .where(facilityCondition),
        ),
  ]);

  return [
    ...new Set(
      [...serviceIssueRows, ...facilityIssueRows].map((row) => row.issueId),
    ),
  ];
}

export function mergeOperatorReadModelScope(input: {
  lineIds: readonly string[];
  serviceIds: readonly string[];
  stationIds: readonly string[];
  issueScope: {
    lineIds: readonly string[];
    serviceIds: readonly string[];
    stationIds: readonly string[];
  };
}) {
  return {
    lineIds: [...new Set([...input.lineIds, ...input.issueScope.lineIds])],
    serviceIds: [
      ...new Set([...input.serviceIds, ...input.issueScope.serviceIds]),
    ],
    stationIds: [
      ...new Set([...input.stationIds, ...input.issueScope.stationIds]),
    ],
  };
}

export async function getOperatorProfileReadModel(
  operatorId: string,
  days: number,
) {
  const referenceNow = nowSg();
  const db = await getDefaultDb();
  const [operatorRow] = await timeDbQuery('operator_profile_q_root', () =>
    db
      .select({ id: operatorsTable.id })
      .from(operatorsTable)
      .where(eq(operatorsTable.id, operatorId))
      .limit(1),
  );
  if (operatorRow == null) {
    throw new Response('Operator not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const operatorLineRows = await timeDbQuery('operator_profile_q_lines', () =>
    db
      .select({ lineId: lineOperatorsTable.line_id })
      .from(lineOperatorsTable)
      .where(eq(lineOperatorsTable.operator_id, operatorId)),
  );
  const lineIds = [...new Set(operatorLineRows.map((row) => row.lineId))];
  const serviceRows =
    lineIds.length > 0
      ? await timeDbQuery('operator_profile_q_services', () =>
          db
            .select({ id: servicesTable.id })
            .from(servicesTable)
            .where(inArray(servicesTable.line_id, lineIds)),
        )
      : [];
  const serviceIds = serviceRows.map((row) => row.id);
  const [pathStationRows, stationCodeRows] = await Promise.all([
    serviceIds.length > 0
      ? timeDbQuery('operator_profile_q_path_stations', () =>
          db
            .select({
              stationId: serviceRevisionPathStationEntriesTable.station_id,
            })
            .from(serviceRevisionPathStationEntriesTable)
            .where(
              inArray(
                serviceRevisionPathStationEntriesTable.service_id,
                serviceIds,
              ),
            ),
        )
      : [],
    lineIds.length > 0
      ? timeDbQuery('operator_profile_q_station_codes', () =>
          db
            .select({ stationId: stationCodesTable.station_id })
            .from(stationCodesTable)
            .where(inArray(stationCodesTable.line_id, lineIds)),
        )
      : [],
  ]);
  const stationIds = [
    ...new Set(
      [...pathStationRows, ...stationCodeRows].map((row) => row.stationId),
    ),
  ];
  const candidateIssueIds = await getOperatorCandidateIssueIds(
    lineIds,
    serviceIds,
    stationIds,
    db,
  );
  const issueScope = await getIssueStaticScope(
    candidateIssueIds,
    db,
    'operator_profile',
  );
  const initialScope = mergeOperatorReadModelScope({
    lineIds,
    serviceIds,
    stationIds,
    issueScope,
  });
  const stationMembershipRows =
    initialScope.stationIds.length > 0
      ? await timeDbQuery('operator_profile_q_membership_lines', () =>
          db
            .select({ lineId: stationCodesTable.line_id })
            .from(stationCodesTable)
            .where(
              inArray(stationCodesTable.station_id, initialScope.stationIds),
            ),
        )
      : [];
  const dataset = await buildDataset(referenceNow, db, candidateIssueIds, {
    lineIds: [
      ...new Set([
        ...initialScope.lineIds,
        ...stationMembershipRows.map((row) => row.lineId),
      ]),
    ],
    serviceIds: initialScope.serviceIds,
    stationIds: initialScope.stationIds,
    operatorIds: [operatorId],
    includePublicHolidays: true,
  });
  const operator = dataset.included.operators[operatorId];
  if (operator == null) {
    throw new Error(
      `Operator ${operatorId} disappeared while building its read model`,
    );
  }

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
        referenceNow.diff(parseDateTime(operator.foundedAt), 'years').years,
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

/** @deprecated Use the explicitly scoped read-model name. */
export const getOperatorProfileData = getOperatorProfileReadModel;

export type OperatorProfile = Awaited<
  ReturnType<typeof getOperatorProfileReadModel>
>['data'];
