import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  lineDayFactsTable,
  lineOperatorsTable,
  linesTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesTable,
  stationCodesTable,
  stationsTable,
} from '~/db/schema';
import { getPublicCrowdReportSignals } from '~/util/crowdReports';
import { sortLineBranchesForCurrentView } from '~/util/lineBranches';
import { selectServiceRevisionForReferenceDate } from '~/util/serviceRevisions';
import { timeServerSpan, timeSyncServerSpan } from '~/util/serverTiming';
import { selectIncludedEntities } from './included';
import { buildStationIncluded, getScopedIssueHydrationFromDb } from './issues';
import { pickIssueTypes } from './issueTypeStats';
import { buildLineSummary } from './lineSummaries';
import { buildFactBackedLineSummaries } from './overview';
import {
  buildLines,
  getDefaultDb,
  getPublicHolidaySetFromDb,
  groupIssuesByLineId,
  mergeBaseIncluded,
  parseTranslations,
  selectByIdChunks,
  timeDbQuery,
} from './shared';
import { buildIssueCountGraphs, buildUptimeGraph } from './timeScaleGraphs';
import { isoDate, nowSg, parseDateTime, SG_TIMEZONE } from './temporal';
import type {
  BaseIncludedEntities,
  BranchWithEntries,
  CommunitySignalOptions,
  IssueWithOperationalEffects,
} from './types';

type LineDayFactRow = typeof lineDayFactsTable.$inferSelect;

async function getLinesFromDb(db: AppDb) {
  const [lineRows, lineOperatorRows] = await timeServerSpan(
    'line_profile_line_queries',
    () =>
      Promise.all([
        timeDbQuery('line_profile_q_lines', () =>
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
            .orderBy(asc(linesTable.id)),
        ),
        timeDbQuery('line_profile_q_line_operators', () =>
          db
            .select({
              line_id: lineOperatorsTable.line_id,
              operator_id: lineOperatorsTable.operator_id,
              started_at: lineOperatorsTable.started_at,
              ended_at: lineOperatorsTable.ended_at,
            })
            .from(lineOperatorsTable),
        ),
      ]),
  );

  return buildLines(lineRows, lineOperatorRows);
}

async function getLineDayFactsFromDb(
  db: AppDb,
  start: DateTime,
  end: DateTime,
) {
  return timeDbQuery('line_profile_q_line_day_facts', () =>
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

async function getLineBranchesFromDb(
  db: AppDb,
  lineId: string,
  referenceNow: DateTime,
) {
  const referenceDate = isoDate(referenceNow);
  const serviceRows = await timeDbQuery('line_profile_q_services', () =>
    db
      .select({
        id: servicesTable.id,
        line_id: servicesTable.line_id,
        name: servicesTable.name,
      })
      .from(servicesTable)
      .where(eq(servicesTable.line_id, lineId))
      .orderBy(asc(servicesTable.id)),
  );
  const serviceIds = serviceRows.map((row) => row.id);
  const serviceRevisionRows = await timeDbQuery(
    'line_profile_q_service_revisions',
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
  const selectedRevisions = serviceIds
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
    );
  const selectedRevisionIds = selectedRevisions.map((revision) => revision.id);
  const servicePathRows = await timeDbQuery(
    'line_profile_q_service_paths',
    () =>
      selectByIdChunks(selectedRevisionIds, (ids) =>
        db
          .select({
            service_revision_id:
              serviceRevisionPathStationEntriesTable.service_revision_id,
            service_id: serviceRevisionPathStationEntriesTable.service_id,
            station_id: serviceRevisionPathStationEntriesTable.station_id,
            display_code: serviceRevisionPathStationEntriesTable.display_code,
            path_index: serviceRevisionPathStationEntriesTable.path_index,
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
  const revisionByServiceId = Object.fromEntries(
    selectedRevisions.map((revision) => [revision.service_id, revision]),
  );
  const pathRowsByRevisionKey = servicePathRows.reduce<
    Record<string, typeof servicePathRows>
  >((acc, row) => {
    const key = `${row.service_revision_id}::${row.service_id}`;
    acc[key] ??= [];
    acc[key].push(row);
    return acc;
  }, {});

  const branches = serviceRows
    .map((service) => {
      const revision = revisionByServiceId[service.id];
      if (revision == null) {
        return null;
      }
      const entries = [
        ...(pathRowsByRevisionKey[`${revision.id}::${service.id}`] ?? []),
      ].sort((a, b) => a.path_index - b.path_index);
      if (entries.length === 0) {
        return null;
      }
      return {
        id: service.id,
        name: parseTranslations(service.name),
        startedAt: revision.start_at,
        endedAt: revision.end_at,
        stationIds: [...new Set(entries.map((entry) => entry.station_id))],
        entries: entries.map((entry) => ({
          stationId: entry.station_id,
          displayCode: entry.display_code,
          pathIndex: entry.path_index,
        })),
      } satisfies BranchWithEntries;
    })
    .filter((branch): branch is BranchWithEntries => branch != null);

  return sortLineBranchesForCurrentView(branches);
}

async function getLineStationIncludedFromDb(
  db: AppDb,
  lineId: string,
  referenceNow: DateTime,
) {
  const stationCodeRows = await timeDbQuery(
    'line_profile_q_station_codes',
    () =>
      db
        .select({
          station_id: stationCodesTable.station_id,
          line_id: stationCodesTable.line_id,
          code: stationCodesTable.code,
          started_at: stationCodesTable.started_at,
          ended_at: stationCodesTable.ended_at,
          structure_type: stationCodesTable.structure_type,
        })
        .from(stationCodesTable)
        .where(eq(stationCodesTable.line_id, lineId))
        .orderBy(
          asc(stationCodesTable.station_id),
          asc(stationCodesTable.code),
        ),
  );
  const stationIds = [...new Set(stationCodeRows.map((row) => row.station_id))];
  const [stationRows, allStationCodeRows] = await Promise.all([
    timeDbQuery('line_profile_q_stations', () =>
      selectByIdChunks(stationIds, (ids) =>
        db
          .select({
            id: stationsTable.id,
            name: stationsTable.name,
            townId: stationsTable.townId,
            latitude: stationsTable.latitude,
            longitude: stationsTable.longitude,
          })
          .from(stationsTable)
          .where(inArray(stationsTable.id, ids)),
      ),
    ),
    timeDbQuery('line_profile_q_station_memberships', () =>
      selectByIdChunks(stationIds, (ids) =>
        db
          .select({
            station_id: stationCodesTable.station_id,
            line_id: stationCodesTable.line_id,
            code: stationCodesTable.code,
            started_at: stationCodesTable.started_at,
            ended_at: stationCodesTable.ended_at,
            structure_type: stationCodesTable.structure_type,
          })
          .from(stationCodesTable)
          .where(inArray(stationCodesTable.station_id, ids)),
      ),
    ),
  ]);

  return {
    stationIds,
    stations: buildStationIncluded(
      stationRows,
      allStationCodeRows,
      isoDate(referenceNow),
    ),
  };
}

async function getCandidateIssueIdsForLineFromDb(
  db: AppDb,
  lineId: string,
  stationIds: readonly string[],
) {
  const serviceRows = await timeDbQuery(
    'line_profile_q_candidate_services',
    () =>
      db
        .select({
          id: servicesTable.id,
        })
        .from(servicesTable)
        .where(eq(servicesTable.line_id, lineId)),
  );
  const serviceIds = serviceRows.map((row) => row.id);
  const [serviceEventRows, lineFacilityEventRows, stationFacilityEventRows] =
    await Promise.all([
      timeDbQuery('line_profile_q_service_issue_events', () =>
        selectByIdChunks(serviceIds, (ids) =>
          db
            .select({
              impact_event_id: impactEventEntityServicesTable.impact_event_id,
            })
            .from(impactEventEntityServicesTable)
            .where(inArray(impactEventEntityServicesTable.service_id, ids)),
        ),
      ),
      timeDbQuery('line_profile_q_line_facility_issue_events', () =>
        db
          .select({
            impact_event_id: impactEventEntityFacilitiesTable.impact_event_id,
          })
          .from(impactEventEntityFacilitiesTable)
          .where(eq(impactEventEntityFacilitiesTable.line_id, lineId)),
      ),
      timeDbQuery('line_profile_q_station_facility_issue_events', () =>
        selectByIdChunks(stationIds, (ids) =>
          db
            .select({
              impact_event_id: impactEventEntityFacilitiesTable.impact_event_id,
            })
            .from(impactEventEntityFacilitiesTable)
            .where(inArray(impactEventEntityFacilitiesTable.station_id, ids)),
        ),
      ),
    ]);
  const eventIds = [
    ...new Set(
      [
        ...serviceEventRows,
        ...lineFacilityEventRows,
        ...stationFacilityEventRows,
      ].map((row) => row.impact_event_id),
    ),
  ];
  const issueRows = await timeDbQuery('line_profile_q_issue_ids', () =>
    selectByIdChunks(eventIds, (ids) =>
      db
        .select({
          issue_id: impactEventsTable.issue_id,
        })
        .from(impactEventsTable)
        .where(inArray(impactEventsTable.id, ids)),
    ),
  );
  return [...new Set(issueRows.map((row) => row.issue_id))];
}

function sortRecentIssueIds(issues: IssueWithOperationalEffects[]) {
  return [...issues]
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
}

function getNextMaintenanceIssueId(issues: IssueWithOperationalEffects[]) {
  return (
    issues
      .filter((issue) => issue.type === 'maintenance')
      .flatMap((issue) =>
        issue.intervals
          .filter((interval) => interval.status === 'future')
          .map((interval) => ({
            issueId: issue.id,
            startAt: interval.startAt,
          })),
      )
      .sort(
        (a, b) =>
          parseDateTime(a.startAt).toMillis() -
          parseDateTime(b.startAt).toMillis(),
      )[0]?.issueId ?? null
  );
}

function getInterchangeStationIds(
  stations: BaseIncludedEntities['stations'],
  lineId: string,
) {
  return [
    ...new Set(
      Object.values(stations)
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
}

export { buildLineSummary };

export async function getLineProfileData(
  lineId: string,
  days: number,
  options: CommunitySignalOptions = {},
) {
  const db = await getDefaultDb();
  return getLineProfileDataFromDb(db, lineId, days, options);
}

export async function getLineProfileDataFromDb(
  db: AppDb,
  lineId: string,
  days: number,
  options: CommunitySignalOptions = {},
  referenceNow = nowSg(),
) {
  return timeServerSpan('line_profile_data', async () => {
    const referenceDateTime = referenceNow.setZone(SG_TIMEZONE);
    const rangeStart = referenceDateTime
      .startOf('day')
      .minus({ days: days - 1 });
    const rangeEnd = referenceDateTime.startOf('day');
    const [lines, publicHolidaySet, lineDayFacts] = await Promise.all([
      getLinesFromDb(db),
      getPublicHolidaySetFromDb(db, 'line_profile_q_public_holidays'),
      getLineDayFactsFromDb(db, rangeStart, rangeEnd),
    ]);
    const line = lines[lineId];
    if (line == null) {
      throw new Response('Line not found', {
        status: 404,
        statusText: 'Not Found',
      });
    }

    const [branches, lineStations, communitySignals] = await Promise.all([
      getLineBranchesFromDb(db, lineId, referenceDateTime),
      getLineStationIncludedFromDb(db, lineId, referenceDateTime),
      options.includeCommunitySignals
        ? getPublicCrowdReportSignals(db, {
            lineId,
            now: referenceDateTime,
          })
        : Promise.resolve([]),
    ]);
    const candidateIssueIds = await getCandidateIssueIdsForLineFromDb(
      db,
      lineId,
      lineStations.stationIds,
    );
    const communitySignalStationIds = [
      ...new Set(communitySignals.flatMap((signal) => signal.stationIds)),
    ];
    const communitySignalLineIds = [
      ...new Set(communitySignals.flatMap((signal) => signal.lineIds)),
    ];
    const issueHydration =
      candidateIssueIds.length > 0 || communitySignalStationIds.length > 0
        ? await getScopedIssueHydrationFromDb({
            db,
            issueIds: candidateIssueIds,
            lines,
            referenceNow: referenceDateTime,
            spanPrefix: 'line_profile',
            stationIds: communitySignalStationIds,
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
    const lineIncluded = {
      lines,
      stations: lineStations.stations,
      operators: {},
      towns: {},
      landmarks: {},
    } satisfies BaseIncludedEntities;
    const baseIncluded = mergeBaseIncluded(
      lineIncluded,
      issueHydration.included,
    );
    const issuesByLineId = groupIssuesByLineId(
      Object.values(issueHydration.allIssues),
    );
    const allLineSummaries = timeSyncServerSpan(
      'line_profile_line_summaries',
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
    const rankedSummary = allLineSummaries.find(
      (summary) => summary.lineId === lineId,
    );
    if (rankedSummary == null) {
      throw new Response('Line not found', {
        status: 404,
        statusText: 'Not Found',
      });
    }
    const lineIssues = issuesByLineId[lineId] ?? [];
    const issueIdsRecent = sortRecentIssueIds(lineIssues);
    const profile = {
      lineId,
      lineSummary: rankedSummary,
      branches,
      issueIdNextMaintenance: getNextMaintenanceIssueId(lineIssues),
      issueIdsRecent,
      issueCountByType: pickIssueTypes(lineIssues),
      timeScaleGraphsIssueCount: buildIssueCountGraphs(lineIssues),
      timeScaleGraphsUptimeRatios: [7, 30, days].map((window) =>
        buildUptimeGraph(line, lineIssues, publicHolidaySet, window),
      ),
      stationIdsInterchanges: getInterchangeStationIds(
        lineStations.stations,
        lineId,
      ),
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
      included: selectIncludedEntities(baseIncluded, issueHydration.allIssues, {
        issueIds: profileIssueIds,
        lineIds: [lineId, ...communitySignalLineIds],
        stationIds: [
          ...Object.keys(lineStations.stations),
          ...communitySignalStationIds,
        ],
        operatorIds: line.operators.map((operator) => operator.operatorId),
        includeStationMembershipLines: true,
      }),
    };
  });
}

export type LineBranch = Awaited<
  ReturnType<typeof getLineProfileData>
>['data']['branches'][number];
