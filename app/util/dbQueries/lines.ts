import { and, eq, gte, inArray, lte, or } from 'drizzle-orm';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  lineDayFactsTable,
  lineOperatorsTable,
  linesTable,
  serviceRevisionPathStationEntriesTable,
  servicesTable,
  stationCodesTable,
} from '~/db/schema';
import { countLineStations } from '~/util/lineBranches';
import {
  type CommunitySignalOptions,
  getPageCommunitySignals,
} from './communitySignals';
import { getDefaultDb, timeDbQuery } from './database';
import { buildDataset, getCompleteDataset } from './dataset';
import { isoDate, nowSg, parseDateTime } from './dateTime';
import { selectIncludedEntities } from './includedEntities';
import { pickIssueTypes } from './issueAnalytics';
import {
  buildIssueCountGraphs,
  buildLineSummary,
  buildUptimeGraph,
  rankLineSummaries,
} from './lineAnalytics';
import { getIssueStaticScope } from './readModelScope';

type LineUptimeFact = Pick<
  typeof lineDayFactsTable.$inferSelect,
  | 'line_id'
  | 'service_seconds'
  | 'downtime_disruption_seconds'
  | 'downtime_maintenance_seconds'
  | 'downtime_infra_seconds'
>;

export function rankLineSummaryFromFacts(
  lineId: string,
  uptimeRatio: number | null,
  rows: readonly LineUptimeFact[],
) {
  const totalsByLineId = new Map<
    string,
    { serviceSeconds: number; downtimeSeconds: number }
  >();
  for (const row of rows) {
    const totals = totalsByLineId.get(row.line_id) ?? {
      serviceSeconds: 0,
      downtimeSeconds: 0,
    };
    totals.serviceSeconds += row.service_seconds;
    totals.downtimeSeconds +=
      row.downtime_disruption_seconds +
      row.downtime_maintenance_seconds +
      row.downtime_infra_seconds;
    totalsByLineId.set(row.line_id, totals);
  }
  if (!totalsByLineId.has(lineId) && uptimeRatio != null) {
    totalsByLineId.set(lineId, { serviceSeconds: 0, downtimeSeconds: 0 });
  }

  const ratios = [...totalsByLineId]
    .flatMap(([candidateLineId, totals]) => {
      const candidateRatio =
        candidateLineId === lineId
          ? uptimeRatio
          : totals.serviceSeconds > 0
            ? Math.max(0, 1 - totals.downtimeSeconds / totals.serviceSeconds)
            : null;
      return candidateRatio == null
        ? []
        : [{ lineId: candidateLineId, uptimeRatio: candidateRatio }];
    })
    .sort((a, b) => {
      const ratioDiff = b.uptimeRatio - a.uptimeRatio;
      return ratioDiff !== 0 ? ratioDiff : a.lineId.localeCompare(b.lineId);
    });
  const rank = ratios.findIndex((entry) => entry.lineId === lineId);

  return {
    uptimeRank: rank === -1 ? null : rank + 1,
    totalLines: ratios.length > 0 ? ratios.length : null,
  };
}

export function mergeLineReadModelScope(input: {
  lineId: string;
  lineServiceIds: readonly string[];
  lineStationIds: readonly string[];
  communityLineIds: readonly string[];
  communityStationIds: readonly string[];
  issueScope: {
    lineIds: readonly string[];
    serviceIds: readonly string[];
    stationIds: readonly string[];
  };
}) {
  return {
    lineIds: [
      ...new Set([
        input.lineId,
        ...input.communityLineIds,
        ...input.issueScope.lineIds,
      ]),
    ],
    serviceIds: [
      ...new Set([...input.lineServiceIds, ...input.issueScope.serviceIds]),
    ],
    stationIds: [
      ...new Set([
        ...input.lineStationIds,
        ...input.communityStationIds,
        ...input.issueScope.stationIds,
      ]),
    ],
  };
}

async function getLineCandidateIssueIds(
  lineId: string,
  serviceIds: readonly string[],
  stationIds: readonly string[],
  db: Awaited<ReturnType<typeof getDefaultDb>>,
) {
  const [serviceIssueRows, facilityIssueRows] = await Promise.all([
    serviceIds.length > 0
      ? timeDbQuery('line_profile_q_service_issues', () =>
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
    timeDbQuery('line_profile_q_facility_issues', () =>
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
        .where(
          stationIds.length > 0
            ? or(
                eq(impactEventEntityFacilitiesTable.line_id, lineId),
                inArray(
                  impactEventEntityFacilitiesTable.station_id,
                  stationIds,
                ),
              )
            : eq(impactEventEntityFacilitiesTable.line_id, lineId),
        ),
    ),
  ]);

  return [
    ...new Set(
      [...serviceIssueRows, ...facilityIssueRows].map((row) => row.issueId),
    ),
  ];
}

export async function getLinesDirectoryData(days: number) {
  const dataset = await getCompleteDataset('route:/lines');
  const referenceNow = nowSg();
  const referenceDate = isoDate(referenceNow);
  const lines = Object.values(dataset.included.lines);
  const summaries = rankLineSummaries(
    lines.map((line) =>
      buildLineSummary(
        line,
        dataset.issuesByLineId[line.id] ?? [],
        days,
        dataset.publicHolidaySet,
        referenceNow,
      ),
    ),
  );
  const summariesByLineId = Object.fromEntries(
    summaries.map((summary) => [summary.lineId, summary]),
  );

  const entries = lines.map((line) => {
    const summary = summariesByLineId[line.id];
    if (summary == null) {
      throw new Error(`Line summary missing for ${line.id}`);
    }
    const operationalState =
      line.startedAt == null || line.startedAt > referenceDate
        ? 'future'
        : 'current';

    return {
      lineId: line.id,
      status: summary.status,
      stationCount: countLineStations(dataset.included.stations, line.id, {
        includePlanned: operationalState === 'future',
        referenceDate,
      }),
      operatorIds: [
        ...new Set(
          line.operators
            .filter(
              (operator) =>
                operator.endedAt == null || operator.endedAt > referenceDate,
            )
            .map((operator) => operator.operatorId),
        ),
      ],
      openingDate: line.startedAt,
      type: line.type,
      uptimeRatio: summary.uptimeRatio,
      uptimeRank: summary.uptimeRank,
      operationalState,
    };
  });

  return {
    data: {
      dateCount: days,
      referenceDate,
      lines: entries,
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: [],
      lineIds: entries.map((entry) => entry.lineId),
      operatorIds: entries.flatMap((entry) => entry.operatorIds),
    }),
  };
}

export async function getLineProfileReadModel(
  lineId: string,
  days: number,
  options: CommunitySignalOptions = {},
) {
  const referenceNow = nowSg();
  const referenceDate = isoDate(referenceNow);
  const db = await getDefaultDb();
  const [lineRow] = await timeDbQuery('line_profile_q_root', () =>
    db
      .select({ id: linesTable.id })
      .from(linesTable)
      .where(eq(linesTable.id, lineId))
      .limit(1),
  );
  if (lineRow == null) {
    throw new Response('Line not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const lineServiceRows = await timeDbQuery('line_profile_q_services', () =>
    db
      .select({ id: servicesTable.id })
      .from(servicesTable)
      .where(eq(servicesTable.line_id, lineId)),
  );
  const lineServiceIds = lineServiceRows.map((row) => row.id);
  const [pathStationRows, lineStationCodeRows] = await Promise.all([
    lineServiceIds.length > 0
      ? timeDbQuery('line_profile_q_path_stations', () =>
          db
            .select({
              stationId: serviceRevisionPathStationEntriesTable.station_id,
            })
            .from(serviceRevisionPathStationEntriesTable)
            .where(
              inArray(
                serviceRevisionPathStationEntriesTable.service_id,
                lineServiceIds,
              ),
            ),
        )
      : [],
    timeDbQuery('line_profile_q_station_codes', () =>
      db
        .select({ stationId: stationCodesTable.station_id })
        .from(stationCodesTable)
        .where(eq(stationCodesTable.line_id, lineId)),
    ),
  ]);
  const lineStationIds = [
    ...new Set(
      [...pathStationRows, ...lineStationCodeRows].map((row) => row.stationId),
    ),
  ];
  const [candidateIssueIds, communitySignals] = await Promise.all([
    getLineCandidateIssueIds(lineId, lineServiceIds, lineStationIds, db),
    getPageCommunitySignals(options, { lineId }),
  ]);
  const issueScope = await getIssueStaticScope(
    candidateIssueIds,
    db,
    'line_profile',
  );
  const initialScope = mergeLineReadModelScope({
    lineId,
    lineServiceIds,
    lineStationIds,
    communityLineIds: communitySignals.flatMap((signal) => signal.lineIds),
    communityStationIds: communitySignals.flatMap(
      (signal) => signal.stationIds,
    ),
    issueScope,
  });
  const [stationMembershipRows, lineOperatorRows, uptimeFactRows] =
    await Promise.all([
      initialScope.stationIds.length > 0
        ? timeDbQuery('line_profile_q_membership_lines', () =>
            db
              .select({ lineId: stationCodesTable.line_id })
              .from(stationCodesTable)
              .where(
                inArray(stationCodesTable.station_id, initialScope.stationIds),
              ),
          )
        : [],
      timeDbQuery('line_profile_q_operators', () =>
        db
          .select({ operatorId: lineOperatorsTable.operator_id })
          .from(lineOperatorsTable)
          .where(eq(lineOperatorsTable.line_id, lineId)),
      ),
      timeDbQuery('line_profile_q_uptime_rank', () =>
        db
          .select({
            line_id: lineDayFactsTable.line_id,
            service_seconds: lineDayFactsTable.service_seconds,
            downtime_disruption_seconds:
              lineDayFactsTable.downtime_disruption_seconds,
            downtime_maintenance_seconds:
              lineDayFactsTable.downtime_maintenance_seconds,
            downtime_infra_seconds: lineDayFactsTable.downtime_infra_seconds,
          })
          .from(lineDayFactsTable)
          .where(
            and(
              gte(
                lineDayFactsTable.date,
                isoDate(referenceNow.startOf('day').minus({ days: days - 1 })),
              ),
              lte(lineDayFactsTable.date, referenceDate),
            ),
          ),
      ),
    ]);
  const lineIds = [
    ...new Set([
      ...initialScope.lineIds,
      ...stationMembershipRows.map((row) => row.lineId),
    ]),
  ];
  const dataset = await buildDataset(referenceNow, db, candidateIssueIds, {
    lineIds,
    serviceIds: initialScope.serviceIds,
    stationIds: initialScope.stationIds,
    operatorIds: lineOperatorRows.map((row) => row.operatorId),
    includePublicHolidays: true,
  });
  const line = dataset.included.lines[lineId];
  if (line == null) {
    throw new Error(`Line ${lineId} disappeared while building its read model`);
  }

  const lineIssues = dataset.issuesByLineId[lineId] ?? [];
  const unrankedSummary = buildLineSummary(
    line,
    lineIssues,
    days,
    dataset.publicHolidaySet,
    referenceNow,
  );
  const rankedSummary = {
    ...unrankedSummary,
    ...rankLineSummaryFromFacts(
      lineId,
      unrankedSummary.uptimeRatio,
      uptimeFactRows,
    ),
  };
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
  const includePlannedStations =
    line.startedAt == null || parseDateTime(line.startedAt) > referenceNow;
  const branches = dataset.branchesByLineId[lineId] ?? [];
  const stationCount = countLineStations(dataset.included.stations, lineId, {
    includePlanned: includePlannedStations,
    referenceDate,
  });

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
    referenceDate,
    lineSummary: rankedSummary,
    branches,
    stationCount,
    issueIdNextMaintenance: futureMaintenance?.issueId ?? null,
    issueIdsRecent,
    issueCountByType: pickIssueTypes(lineIssues),
    timeScaleGraphsIssueCount: buildIssueCountGraphs(lineIssues),
    timeScaleGraphsUptimeRatios: [7, 30, days].map((window) =>
      buildUptimeGraph(line, lineIssues, dataset.publicHolidaySet, window),
    ),
    stationIdsInterchanges,
    communitySignals,
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

/** @deprecated Use the explicitly scoped read-model name. */
export const getLineProfileData = getLineProfileReadModel;

export type LineBranch = Awaited<
  ReturnType<typeof getLineProfileReadModel>
>['data']['branches'][number];
