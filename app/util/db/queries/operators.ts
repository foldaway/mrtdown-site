import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  impactEventPeriodsTable,
  lineDayFactsTable,
  lineOperatorsTable,
  linesTable,
  operatorsTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesTable,
} from '~/db/schema';
import type { LineSummary } from '~/types';
import { selectServiceRevisionForReferenceDate } from '~/util/serviceRevisions';
import { timeServerSpan, timeSyncServerSpan } from '~/util/serverTiming';
import { selectIncludedEntities } from './included';
import {
  issueOverlapsRange,
  sortIssuesByLatestActivity,
} from './issueIntervals';
import { getScopedIssueHydrationFromDb } from './issues';
import { pickIssueDurationByType, pickIssueTypes } from './issueTypeStats';
import { buildFactBackedLineSummaries } from './overview';
import {
  buildLines,
  buildOperators,
  getDefaultDb,
  getPublicHolidaySetFromDb,
  groupIssuesByLineId,
  mergeBaseIncluded,
  selectByIdChunks,
  timeDbQuery,
} from './shared';
import {
  buildIssueCountGraphs,
  buildOperatorUptimeGraph,
} from './timeScaleGraphs';
import { isoDate, nowSg, parseDateTime, SG_TIMEZONE } from './temporal';
import type {
  BaseIncludedEntities,
  IssueWithOperationalEffects,
  OperatorLinePerformance,
  OperatorOperationalStatus,
} from './types';

type LineDayFactRow = typeof lineDayFactsTable.$inferSelect;

/**
 * Reads the operator and its operated lines without touching the legacy base
 * dataset. Missing operators intentionally short-circuit before any wider
 * profile queries run.
 */
async function getOperatorBaseIncludedFromDb(db: AppDb, operatorId: string) {
  const operatorRows = await timeDbQuery('operator_profile_q_operator', () =>
    db
      .select({
        id: operatorsTable.id,
        name: operatorsTable.name,
        founded_at: operatorsTable.founded_at,
        url: operatorsTable.url,
      })
      .from(operatorsTable)
      .where(eq(operatorsTable.id, operatorId)),
  );
  const operator = operatorRows[0];
  if (operator == null) {
    throw new Response('Operator not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const operatorLineRows = await timeDbQuery(
    'operator_profile_q_operator_line_ids',
    () =>
      db
        .select({
          line_id: lineOperatorsTable.line_id,
        })
        .from(lineOperatorsTable)
        .where(eq(lineOperatorsTable.operator_id, operatorId))
        .orderBy(asc(lineOperatorsTable.line_id)),
  );
  const lineIds = [...new Set(operatorLineRows.map((row) => row.line_id))];
  const [lineRows, lineOperatorRows] = await Promise.all([
    timeDbQuery('operator_profile_q_lines', () =>
      selectByIdChunks(lineIds, (ids) =>
        db
          .select({
            id: linesTable.id,
            name: linesTable.name,
            type: linesTable.type,
            color: linesTable.color,
            started_at: linesTable.started_at,
            operating_hours: linesTable.operating_hours,
          })
          .from(linesTable)
          .where(inArray(linesTable.id, ids)),
      ),
    ),
    timeDbQuery('operator_profile_q_line_operators', () =>
      selectByIdChunks(lineIds, (ids) =>
        db
          .select({
            line_id: lineOperatorsTable.line_id,
            operator_id: lineOperatorsTable.operator_id,
            started_at: lineOperatorsTable.started_at,
            ended_at: lineOperatorsTable.ended_at,
          })
          .from(lineOperatorsTable)
          .where(inArray(lineOperatorsTable.line_id, ids)),
      ),
    ),
  ]);

  return {
    included: {
      lines: buildLines(lineRows, lineOperatorRows),
      stations: {},
      operators: buildOperators(operatorRows),
      towns: {},
      landmarks: {},
    } satisfies BaseIncludedEntities,
    lineIds,
  };
}

async function getLineDayFactsFromDb(
  db: AppDb,
  start: DateTime,
  end: DateTime,
) {
  return timeDbQuery('operator_profile_q_line_day_facts', () =>
    db
      .select({
        date: lineDayFactsTable.date,
        line_id: lineDayFactsTable.line_id,
        service_seconds: lineDayFactsTable.service_seconds,
        downtime_disruption_seconds:
          lineDayFactsTable.downtime_disruption_seconds,
        downtime_maintenance_seconds:
          lineDayFactsTable.downtime_maintenance_seconds,
        downtime_infra_seconds: lineDayFactsTable.downtime_infra_seconds,
        issue_count_disruption: lineDayFactsTable.issue_count_disruption,
        issue_count_maintenance: lineDayFactsTable.issue_count_maintenance,
        issue_count_infra: lineDayFactsTable.issue_count_infra,
      })
      .from(lineDayFactsTable)
      .where(
        and(
          gte(lineDayFactsTable.date, isoDate(start)),
          lte(lineDayFactsTable.date, isoDate(end)),
        ),
      ),
  );
}

/**
 * Derives the stations currently operated by the selected operator's lines from
 * active service revisions, matching the route-shaped profile view.
 */
async function getOperatorServiceStationIdsFromDb(
  db: AppDb,
  lineIds: readonly string[],
  referenceNow: DateTime,
) {
  const serviceRows = await timeDbQuery('operator_profile_q_services', () =>
    selectByIdChunks(lineIds, (ids) =>
      db
        .select({
          id: servicesTable.id,
          line_id: servicesTable.line_id,
        })
        .from(servicesTable)
        .where(inArray(servicesTable.line_id, ids)),
    ),
  );
  const serviceIds = serviceRows.map((row) => row.id);
  const serviceRevisionRows = await timeDbQuery(
    'operator_profile_q_service_revisions',
    () =>
      selectByIdChunks(serviceIds, (ids) =>
        db
          .select({
            id: serviceRevisionsTable.id,
            service_id: serviceRevisionsTable.service_id,
            start_at: serviceRevisionsTable.start_at,
            end_at: serviceRevisionsTable.end_at,
            updated_at: serviceRevisionsTable.updated_at,
          })
          .from(serviceRevisionsTable)
          .where(inArray(serviceRevisionsTable.service_id, ids)),
      ),
  );
  const referenceDate = isoDate(referenceNow);
  const selectedRevisionIds = serviceIds
    .map((serviceId) =>
      selectServiceRevisionForReferenceDate(
        serviceRevisionRows.filter(
          (revision) => revision.service_id === serviceId,
        ),
        referenceDate,
      ),
    )
    .filter(
      (revision): revision is (typeof serviceRevisionRows)[number] =>
        revision != null,
    )
    .map((revision) => revision.id);
  const servicePathRows = await timeDbQuery(
    'operator_profile_q_service_paths',
    () =>
      selectByIdChunks(selectedRevisionIds, (ids) =>
        db
          .select({
            station_id: serviceRevisionPathStationEntriesTable.station_id,
          })
          .from(serviceRevisionPathStationEntriesTable)
          .where(
            inArray(
              serviceRevisionPathStationEntriesTable.service_revision_id,
              ids,
            ),
          ),
      ),
  );

  return {
    serviceIds,
    stationIds: [...new Set(servicePathRows.map((row) => row.station_id))],
  };
}

/**
 * Selects issue ids that may affect an operator through operated services,
 * line-scoped facilities, or station-scoped facilities. Full issue details are
 * hydrated later by the shared scoped issue reader.
 */
async function getCandidateIssueIdsForOperatorFromDb({
  db,
  lineIds,
  serviceIds,
  stationIds,
}: {
  db: AppDb;
  lineIds: readonly string[];
  serviceIds: readonly string[];
  stationIds: readonly string[];
}) {
  const [serviceIssueRows, lineFacilityIssueRows, stationFacilityIssueRows] =
    await Promise.all([
      timeDbQuery('operator_profile_q_service_issue_ids', () =>
        selectByIdChunks(serviceIds, (ids) =>
          db
            .select({
              issue_id: impactEventsTable.issue_id,
            })
            .from(impactEventEntityServicesTable)
            .innerJoin(
              impactEventsTable,
              eq(
                impactEventEntityServicesTable.impact_event_id,
                impactEventsTable.id,
              ),
            )
            .where(inArray(impactEventEntityServicesTable.service_id, ids))
            .groupBy(impactEventsTable.issue_id),
        ),
      ),
      timeDbQuery('operator_profile_q_line_facility_issue_ids', () =>
        selectByIdChunks(lineIds, (ids) =>
          db
            .select({
              issue_id: impactEventsTable.issue_id,
            })
            .from(impactEventEntityFacilitiesTable)
            .innerJoin(
              impactEventsTable,
              eq(
                impactEventEntityFacilitiesTable.impact_event_id,
                impactEventsTable.id,
              ),
            )
            .where(inArray(impactEventEntityFacilitiesTable.line_id, ids))
            .groupBy(impactEventsTable.issue_id),
        ),
      ),
      timeDbQuery('operator_profile_q_station_facility_issue_ids', () =>
        selectByIdChunks(stationIds, (ids) =>
          db
            .select({
              issue_id: impactEventsTable.issue_id,
            })
            .from(impactEventEntityFacilitiesTable)
            .innerJoin(
              impactEventsTable,
              eq(
                impactEventEntityFacilitiesTable.impact_event_id,
                impactEventsTable.id,
              ),
            )
            .where(inArray(impactEventEntityFacilitiesTable.station_id, ids))
            .groupBy(impactEventsTable.issue_id),
        ),
      ),
    ]);
  return [
    ...new Set(
      [
        ...serviceIssueRows,
        ...lineFacilityIssueRows,
        ...stationFacilityIssueRows,
      ].map((row) => row.issue_id),
    ),
  ];
}

function latestPeriodEventIdsByIssueId(
  events: Array<{
    id: string;
    issue_id: string;
    ts: string;
  }>,
) {
  const latestEventsByIssueId = events.reduce<
    Record<string, (typeof events)[number]>
  >((acc, event) => {
    const current = acc[event.issue_id];
    if (current == null) {
      acc[event.issue_id] = event;
      return acc;
    }
    const tsDiff =
      parseDateTime(event.ts).toMillis() - parseDateTime(current.ts).toMillis();
    if (tsDiff > 0 || (tsDiff === 0 && event.id > current.id)) {
      acc[event.issue_id] = event;
    }
    return acc;
  }, {});

  return Object.fromEntries(
    Object.entries(latestEventsByIssueId).map(([issueId, event]) => [
      issueId,
      event.id,
    ]),
  );
}

/**
 * Keeps full issue hydration bounded to issues that can affect the rendered
 * status, recent-issue, and trend windows. Candidate selection remains
 * operator-scoped; this only filters old historical issues before detail reads.
 */
async function filterCandidateIssueIdsByPeriodWindowFromDb({
  db,
  issueIds,
  start,
  end,
}: {
  db: AppDb;
  issueIds: readonly string[];
  start: DateTime;
  end: DateTime;
}) {
  const periodEventRows = await timeDbQuery(
    'operator_profile_q_candidate_period_events',
    () =>
      selectByIdChunks(issueIds, (ids) =>
        db
          .select({
            id: impactEventsTable.id,
            issue_id: impactEventsTable.issue_id,
            ts: impactEventsTable.ts,
          })
          .from(impactEventsTable)
          .where(
            and(
              inArray(impactEventsTable.issue_id, ids),
              eq(impactEventsTable.type, 'periods.set'),
            ),
          ),
      ),
  );
  const latestPeriodEventIdByIssueId =
    latestPeriodEventIdsByIssueId(periodEventRows);
  const latestPeriodEventIds = Object.values(latestPeriodEventIdByIssueId);
  const periodRows = await timeDbQuery(
    'operator_profile_q_candidate_periods',
    () =>
      selectByIdChunks(latestPeriodEventIds, (ids) =>
        db
          .select({
            impact_event_id: impactEventPeriodsTable.impact_event_id,
            start_at: impactEventPeriodsTable.start_at,
            end_at: impactEventPeriodsTable.end_at,
          })
          .from(impactEventPeriodsTable)
          .where(inArray(impactEventPeriodsTable.impact_event_id, ids)),
      ),
  );
  const issueIdByPeriodEventId = new Map(
    Object.entries(latestPeriodEventIdByIssueId).map(([issueId, eventId]) => [
      eventId,
      issueId,
    ]),
  );
  const startMillis = start.toMillis();
  const endMillis = end.toMillis();
  const filteredIssueIds = new Set<string>();

  for (const period of periodRows) {
    const issueId = issueIdByPeriodEventId.get(period.impact_event_id);
    if (issueId == null) {
      continue;
    }
    const periodStart = parseDateTime(period.start_at).toMillis();
    const periodEnd =
      period.end_at != null
        ? parseDateTime(period.end_at).toMillis()
        : Number.POSITIVE_INFINITY;
    if (periodStart < endMillis && periodEnd >= startMillis) {
      filteredIssueIds.add(issueId);
    }
  }

  return [...filteredIssueIds];
}

function getCurrentOperationalStatus(
  activeSummaries: LineSummary[],
): OperatorOperationalStatus {
  if (
    activeSummaries.length > 0 &&
    activeSummaries.every((summary) =>
      ['closed_for_day', 'future_service'].includes(summary.status),
    )
  ) {
    return 'all_lines_closed_for_day';
  }
  if (
    activeSummaries.some((summary) => summary.status === 'ongoing_disruption')
  ) {
    return 'some_lines_disrupted';
  }
  if (
    activeSummaries.some((summary) =>
      ['ongoing_maintenance', 'ongoing_infra'].includes(summary.status),
    )
  ) {
    return 'some_lines_under_maintenance';
  }
  return 'all_operational';
}

/**
 * Loads operator profile data from the default application database.
 */
export async function getOperatorProfileData(operatorId: string, days: number) {
  const db = await getDefaultDb();
  return getOperatorProfileDataFromDb(db, operatorId, days);
}

/**
 * Builds the operator profile payload from route-shaped reads: compact operator
 * and line membership data, line-day facts, current service-path station
 * coverage, and scoped candidate issue hydration.
 */
export async function getOperatorProfileDataFromDb(
  db: AppDb,
  operatorId: string,
  days: number,
  referenceNow = nowSg(),
) {
  return timeServerSpan('operator_profile_data', async () => {
    const referenceDateTime = referenceNow.setZone(SG_TIMEZONE);
    const rangeStart = referenceDateTime
      .startOf('day')
      .minus({ days: days - 1 });
    const rangeEnd = referenceDateTime.startOf('day');
    const operatorBase = await getOperatorBaseIncludedFromDb(db, operatorId);
    const [publicHolidaySet, lineDayFacts] = await Promise.all([
      getPublicHolidaySetFromDb(db, 'operator_profile_q_public_holidays'),
      getLineDayFactsFromDb(db, rangeStart, rangeEnd),
    ]);
    const lines = operatorBase.included.lines;
    const { serviceIds, stationIds } = await getOperatorServiceStationIdsFromDb(
      db,
      operatorBase.lineIds,
      referenceDateTime,
    );
    const candidateIssueIds = await getCandidateIssueIdsForOperatorFromDb({
      db,
      lineIds: operatorBase.lineIds,
      serviceIds,
      stationIds,
    });
    const hydrationWindowDays = Math.max(days, 90) * 2;
    const hydrationStart = referenceDateTime
      .startOf('day')
      .minus({ days: hydrationWindowDays - 1 });
    const routeWindowEnd = referenceDateTime.startOf('day').plus({ days: 1 });
    const scopedCandidateIssueIds =
      await filterCandidateIssueIdsByPeriodWindowFromDb({
        db,
        issueIds: candidateIssueIds,
        start: hydrationStart,
        end: routeWindowEnd,
      });
    const issueHydration =
      scopedCandidateIssueIds.length > 0
        ? await getScopedIssueHydrationFromDb({
            db,
            issueIds: scopedCandidateIssueIds,
            lines,
            referenceNow: referenceDateTime,
            spanPrefix: 'operator_profile',
          })
        : {
            allIssues: {},
            included: {
              lines,
              stations: {},
              operators: {},
              towns: {},
              landmarks: {},
            } satisfies BaseIncludedEntities,
          };
    const baseIncluded = mergeBaseIncluded(
      operatorBase.included,
      issueHydration.included,
    );
    const issuesByLineId = groupIssuesByLineId(
      Object.values(issueHydration.allIssues),
    );
    const operatorLineIdSet = new Set(operatorBase.lineIds);
    const operatorIssues = Object.values(issueHydration.allIssues).filter(
      (issue) => issue.lineIds.some((lineId) => operatorLineIdSet.has(lineId)),
    );
    const operatorIssuesInRouteWindow = operatorIssues.filter((issue) =>
      issueOverlapsRange(issue, rangeStart, routeWindowEnd),
    );
    const allLineSummaries = timeSyncServerSpan(
      'operator_profile_line_summaries',
      () =>
        buildFactBackedLineSummaries({
          days,
          facts: lineDayFacts as LineDayFactRow[],
          lines,
          publicHolidaySet,
          issuesByLineId,
          referenceNow: referenceDateTime,
        }),
    );
    const lineSummaries = Object.fromEntries(
      operatorBase.lineIds
        .map((lineId) =>
          allLineSummaries.find((summary) => summary.lineId === lineId),
        )
        .filter((summary): summary is LineSummary => summary != null)
        .map((summary) => [summary.lineId, summary]),
    ) as Record<string, LineSummary>;
    const operatorLines = operatorBase.lineIds
      .map((lineId) => lines[lineId])
      .filter(
        (line): line is NonNullable<(typeof lines)[string]> => line != null,
      );
    const operatorIssuesByLineId = Object.fromEntries(
      operatorBase.lineIds.map((lineId) => [
        lineId,
        issuesByLineId[lineId] ?? [],
      ]),
    ) as Record<string, IssueWithOperationalEffects[]>;
    const operatorIssuesInRouteWindowByLineId = groupIssuesByLineId(
      operatorIssuesInRouteWindow,
    );

    const linePerformanceComparison: OperatorLinePerformance[] =
      operatorBase.lineIds.flatMap((lineId) => {
        const summary = lineSummaries[lineId];
        if (summary == null) {
          return [];
        }
        return {
          lineId,
          status: summary.status,
          uptimeRatio: summary.uptimeRatio,
          issueCount: (operatorIssuesInRouteWindowByLineId[lineId] ?? [])
            .length,
        };
      });
    const activeSummaries = Object.values(lineSummaries);
    const linesAffected = activeSummaries
      .filter((summary) =>
        ['ongoing_disruption', 'ongoing_maintenance', 'ongoing_infra'].includes(
          summary.status,
        ),
      )
      .map((summary) => summary.lineId);
    const totalServiceSeconds = activeSummaries.reduce(
      (sum, summary) => sum + (summary.totalServiceSeconds ?? 0),
      0,
    );
    const totalDowntimeSeconds = activeSummaries.reduce(
      (sum, summary) => sum + (summary.totalDowntimeSeconds ?? 0),
      0,
    );
    const operator = operatorBase.included.operators[operatorId];
    const profile = {
      operatorId,
      lineIds: operatorBase.lineIds,
      aggregateUptimeRatio:
        totalServiceSeconds > 0
          ? Math.max(0, 1 - totalDowntimeSeconds / totalServiceSeconds)
          : null,
      currentOperationalStatus: getCurrentOperationalStatus(activeSummaries),
      linesAffected,
      totalIssuesByType: pickIssueTypes(operatorIssuesInRouteWindow),
      totalStationsOperated: stationIds.length,
      issueIdsRecent: sortIssuesByLatestActivity(
        operatorIssues.map((issue) => issue.id),
        issueHydration.allIssues,
      ).slice(0, 15),
      timeScaleGraphsIssueCount: buildIssueCountGraphs(operatorIssues),
      timeScaleGraphsUptimeRatios: [7, 30, days].map((window) =>
        buildOperatorUptimeGraph(
          operatorLines,
          operatorIssuesByLineId,
          publicHolidaySet,
          window,
        ),
      ),
      linePerformanceComparison,
      totalDowntimeDurationSeconds: totalDowntimeSeconds,
      downtimeDurationByIssueType: pickIssueDurationByType(operatorIssues),
      yearsOfOperation:
        operator == null
          ? 0
          : Math.max(
              0,
              Math.floor(
                referenceDateTime.diff(
                  parseDateTime(operator.foundedAt),
                  'years',
                ).years,
              ),
            ),
    };

    return {
      data: profile,
      included: selectIncludedEntities(baseIncluded, issueHydration.allIssues, {
        issueIds: profile.issueIdsRecent,
        lineIds: profile.lineIds,
        operatorIds: [operatorId],
        includeStationMembershipLines: true,
      }),
    };
  });
}

export type OperatorProfile = Awaited<
  ReturnType<typeof getOperatorProfileData>
>['data'];
