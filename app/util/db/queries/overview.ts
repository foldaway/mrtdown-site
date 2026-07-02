import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import {
  evidencesTable,
  impactEventCausesTable,
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventFacilityEffectsTable,
  impactEventPeriodsTable,
  impactEventServiceEffectsTable,
  impactEventServiceScopesTable,
  impactEventsTable,
  issuesTable,
  lineDayFactsTable,
  lineOperatorsTable,
  linesTable,
  publicHolidaysTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesTable,
  stationCodesTable,
  stationsTable,
} from '~/db/schema';
import type {
  IncludedEntities,
  IssueAffectedBranch,
  Line,
  LineSummary,
  Station,
} from '~/types';
import { getPublicCrowdReportSignals } from '~/util/crowdReports';
import { selectServiceRevisionForReferenceDate } from '~/util/serviceRevisions';
import { timeServerSpan, timeSyncServerSpan } from '~/util/serverTiming';
import { selectIncludedEntities } from './included';
import {
  issueActiveNow,
  issueActiveToday,
  resolveOperationalIssueIntervals,
  sumIntervalSeconds,
} from './issueIntervals';
import {
  buildIssueTypeBreakdownForDate,
  rankLineSummaries,
} from './lineSummaries';
import {
  isLineFuture,
  isLineOperatingNow,
  lineDayType,
  serviceWindowForDate,
} from './lineService';
import {
  deriveServiceScopeStationIds,
  selectServiceBranchSourceEvents,
} from './serviceScopes';
import { getDefaultDb, selectByIdChunks, timeDbQuery } from './shared';
import { isoDate, isoDateTime, nowSg, parseDateTime } from './temporal';
import type {
  BaseIncludedEntities,
  BranchWithEntries,
  CommunitySignalOptions,
  IssueWithOperationalEffects,
} from './types';

type LineDayFactRow = typeof lineDayFactsTable.$inferSelect;
type OverviewDb = AppDb;

function parseTranslations(value: unknown): Line['name'] {
  const isNonEmptyTranslation = (
    translation: string | null | undefined,
  ): translation is string =>
    typeof translation === 'string' && translation.trim().length > 0;
  const rawTranslations =
    value != null && typeof value === 'object'
      ? (value as Record<string, string | null | undefined>)
      : {};
  const fallback =
    [rawTranslations['en-SG'], rawTranslations.en].find(
      isNonEmptyTranslation,
    ) ??
    Object.values(rawTranslations).find(isNonEmptyTranslation) ??
    '';
  return {
    'en-SG': fallback,
    'zh-Hans': rawTranslations['zh-Hans'] ?? null,
    ms: rawTranslations.ms ?? null,
    ta: rawTranslations.ta ?? null,
  };
}

async function getLinesFromDb(db: OverviewDb) {
  const [lineRows, lineOperatorRows] = await timeServerSpan(
    'overview_line_queries',
    () =>
      Promise.all([
        timeDbQuery('overview_q_lines', () =>
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
        timeDbQuery('overview_q_line_operators', () =>
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

  const operatorsByLineId = lineOperatorRows.reduce<
    Record<string, Line['operators']>
  >((acc, row) => {
    acc[row.line_id] ??= [];
    acc[row.line_id].push({
      operatorId: row.operator_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    });
    return acc;
  }, {});

  return Object.fromEntries(
    lineRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: parseTranslations(row.name),
        type: row.type,
        color: row.color,
        startedAt: row.started_at,
        operatingHours: row.operating_hours,
        operators: operatorsByLineId[row.id] ?? [],
      } satisfies Line,
    ]),
  );
}

async function getPublicHolidaySetFromDb(db: OverviewDb) {
  const rows = await timeDbQuery('overview_q_public_holidays', () =>
    db
      .select({
        date: publicHolidaysTable.date,
      })
      .from(publicHolidaysTable),
  );
  return new Set(rows.map((row) => row.date));
}

async function getLineDayFactsFromDb(
  db: OverviewDb,
  start: DateTime,
  end: DateTime,
) {
  return timeDbQuery('overview_q_line_day_facts', () =>
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

async function getIssueIdsOverlappingRange(
  db: OverviewDb,
  start: DateTime,
  end: DateTime,
) {
  const overlappingPeriodRows = await timeDbQuery(
    'overview_q_overlapping_periods',
    () =>
      db
        .select({
          impact_event_id: impactEventPeriodsTable.impact_event_id,
        })
        .from(impactEventPeriodsTable)
        .where(
          sql`${impactEventPeriodsTable.start_at} < ${isoDateTime(end)} and (${impactEventPeriodsTable.end_at} is null or ${impactEventPeriodsTable.end_at} > ${isoDateTime(start)})`,
        ),
  );
  const overlappingPeriodEventIds = [
    ...new Set(overlappingPeriodRows.map((row) => row.impact_event_id)),
  ];
  const overlappingPeriodEventIdSet = new Set(overlappingPeriodEventIds);
  const overlappingPeriodEventRows = await timeDbQuery(
    'overview_q_period_events_for_overlap',
    () =>
      selectByIdChunks(overlappingPeriodEventIds, (ids) =>
        db
          .select({
            id: impactEventsTable.id,
            issue_id: impactEventsTable.issue_id,
          })
          .from(impactEventsTable)
          .where(inArray(impactEventsTable.id, ids)),
      ),
  );
  const candidateIssueIds = [
    ...new Set(overlappingPeriodEventRows.map((event) => event.issue_id)),
  ];
  const periodEventRows = await timeDbQuery(
    'overview_q_period_events_for_issues',
    () =>
      selectByIdChunks(candidateIssueIds, (ids) =>
        db
          .select({
            id: impactEventsTable.id,
            issue_id: impactEventsTable.issue_id,
            ts: impactEventsTable.ts,
          })
          .from(impactEventsTable)
          .where(
            and(
              eq(impactEventsTable.type, 'periods.set'),
              inArray(impactEventsTable.issue_id, ids),
            ),
          ),
      ),
  );
  const latestPeriodEventByIssueId = periodEventRows.reduce<
    Record<string, (typeof periodEventRows)[number]>
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

  return Object.values(latestPeriodEventByIssueId)
    .filter((event) => overlappingPeriodEventIdSet.has(event.id))
    .map((event) => event.issue_id);
}

function emptyIncluded(lines: Record<string, Line>): BaseIncludedEntities {
  return {
    lines,
    stations: {},
    operators: {},
    towns: {},
    landmarks: {},
  };
}

function latestByIssueIdAndType(
  events: Array<
    Pick<
      typeof impactEventsTable.$inferSelect,
      'id' | 'issue_id' | 'ts' | 'type'
    >
  >,
) {
  return events.reduce<
    Record<
      string,
      Partial<Record<(typeof events)[number]['type'], (typeof events)[number]>>
    >
  >((acc, event) => {
    acc[event.issue_id] ??= {};
    const current = acc[event.issue_id][event.type];
    if (current == null) {
      acc[event.issue_id][event.type] = event;
      return acc;
    }

    const tsDiff =
      parseDateTime(event.ts).toMillis() - parseDateTime(current.ts).toMillis();
    if (tsDiff > 0 || (tsDiff === 0 && event.id > current.id)) {
      acc[event.issue_id][event.type] = event;
    }
    return acc;
  }, {});
}

function groupByImpactEventId<T extends { impact_event_id: string }>(
  rows: T[],
) {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    acc[row.impact_event_id] ??= [];
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});
}

function stationMembershipsFromCodes(
  stationCodeRows: Array<
    Pick<
      typeof stationCodesTable.$inferSelect,
      | 'station_id'
      | 'line_id'
      | 'code'
      | 'started_at'
      | 'ended_at'
      | 'structure_type'
    >
  >,
  referenceDate: string,
) {
  return stationCodeRows.reduce<Record<string, Station['memberships']>>(
    (acc, row) => {
      acc[row.station_id] ??= [];
      acc[row.station_id].push({
        lineId: row.line_id,
        branchId: `${row.line_id}:${row.code}`,
        code: row.code,
        startedAt: row.started_at,
        endedAt:
          row.ended_at != null && row.ended_at < referenceDate
            ? row.ended_at
            : undefined,
        structureType: row.structure_type,
        sequenceOrder: 0,
      });
      return acc;
    },
    {},
  );
}

function buildStationIncluded(
  stationRows: Array<
    Pick<
      typeof stationsTable.$inferSelect,
      'id' | 'name' | 'townId' | 'latitude' | 'longitude'
    >
  >,
  stationCodeRows: Array<
    Pick<
      typeof stationCodesTable.$inferSelect,
      | 'station_id'
      | 'line_id'
      | 'code'
      | 'started_at'
      | 'ended_at'
      | 'structure_type'
    >
  >,
  referenceDate: string,
) {
  const membershipsByStationId = stationMembershipsFromCodes(
    stationCodeRows,
    referenceDate,
  );
  return Object.fromEntries(
    stationRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: parseTranslations(row.name),
        geo: {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        },
        memberships: (membershipsByStationId[row.id] ?? []).sort((a, b) => {
          if (a.lineId !== b.lineId) {
            return a.lineId.localeCompare(b.lineId);
          }
          return a.code.localeCompare(b.code);
        }),
        townId: row.townId,
        landmarkIds: [],
      } satisfies Station,
    ]),
  );
}

function buildBranchesByServiceId({
  serviceRows,
  serviceRevisionRows,
  servicePathRows,
  referenceDate,
}: {
  serviceRows: Array<
    Pick<typeof servicesTable.$inferSelect, 'id' | 'line_id' | 'name'>
  >;
  serviceRevisionRows: Array<
    Pick<
      typeof serviceRevisionsTable.$inferSelect,
      'id' | 'service_id' | 'start_at' | 'end_at' | 'updated_at'
    >
  >;
  servicePathRows: Array<
    Pick<
      typeof serviceRevisionPathStationEntriesTable.$inferSelect,
      | 'service_revision_id'
      | 'service_id'
      | 'station_id'
      | 'display_code'
      | 'path_index'
    >
  >;
  referenceDate: string;
}) {
  const revisionsByServiceId = serviceRevisionRows.reduce<
    Record<string, typeof serviceRevisionRows>
  >((acc, row) => {
    acc[row.service_id] ??= [];
    acc[row.service_id].push(row);
    return acc;
  }, {});
  const pathRowsByRevisionKey = servicePathRows.reduce<
    Record<string, typeof servicePathRows>
  >((acc, row) => {
    const key = `${row.service_revision_id}::${row.service_id}`;
    acc[key] ??= [];
    acc[key].push(row);
    return acc;
  }, {});

  const serviceById = Object.fromEntries(
    serviceRows.map((service) => [service.id, service]),
  );
  const branchByServiceId: Record<string, BranchWithEntries> = {};

  for (const service of serviceRows) {
    const revision = selectServiceRevisionForReferenceDate(
      revisionsByServiceId[service.id] ?? [],
      referenceDate,
    );
    if (revision == null) {
      continue;
    }

    const entries = [
      ...(pathRowsByRevisionKey[`${revision.id}::${service.id}`] ?? []),
    ].sort((a, b) => a.path_index - b.path_index);
    if (entries.length === 0) {
      continue;
    }

    branchByServiceId[service.id] = {
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
    };
  }

  return { branchByServiceId, serviceById };
}

async function getOverviewIssueHydrationFromDb({
  db,
  issueIds,
  lines,
  referenceNow,
  stationIds,
}: {
  db: OverviewDb;
  issueIds: readonly string[];
  lines: Record<string, Line>;
  referenceNow: DateTime;
  stationIds: readonly string[];
}) {
  const selectedIssueIds = [...new Set(issueIds)];
  const referenceDate = isoDate(referenceNow);

  const [issueRows, impactEventRows, latestEvidenceRows] = await Promise.all([
    timeDbQuery('overview_q_issues', () =>
      selectByIdChunks(selectedIssueIds, (ids) =>
        db
          .select({
            id: issuesTable.id,
            title: issuesTable.title,
            type: issuesTable.type,
          })
          .from(issuesTable)
          .where(inArray(issuesTable.id, ids)),
      ),
    ),
    timeDbQuery('overview_q_impact_events', () =>
      selectByIdChunks(selectedIssueIds, (ids) =>
        db
          .select({
            id: impactEventsTable.id,
            ts: impactEventsTable.ts,
            issue_id: impactEventsTable.issue_id,
            type: impactEventsTable.type,
          })
          .from(impactEventsTable)
          .where(inArray(impactEventsTable.issue_id, ids)),
      ),
    ),
    timeDbQuery('overview_q_latest_evidence', () =>
      selectByIdChunks(selectedIssueIds, (ids) =>
        db
          .select({
            issue_id: evidencesTable.issue_id,
            latest_ts: sql<string>`max(${evidencesTable.ts})`,
          })
          .from(evidencesTable)
          .where(inArray(evidencesTable.issue_id, ids))
          .groupBy(evidencesTable.issue_id),
      ),
    ),
  ]);

  const latestEventByTypeByIssueId = latestByIssueIdAndType(impactEventRows);
  const selectedStateEventIds = [
    ...new Set(
      Object.values(latestEventByTypeByIssueId).flatMap((latestEventByType) =>
        [
          latestEventByType['periods.set'],
          latestEventByType['causes.set'],
          latestEventByType['service_scopes.set'],
          latestEventByType['service_effects.set'],
          latestEventByType['facility_effects.set'],
        ]
          .filter(
            (event): event is (typeof impactEventRows)[number] => event != null,
          )
          .map((event) => event.id),
      ),
    ),
  ];
  const periodEventIds = [
    ...new Set(
      Object.values(latestEventByTypeByIssueId)
        .map((latestEventByType) => latestEventByType['periods.set']?.id)
        .filter((eventId): eventId is string => eventId != null),
    ),
  ];

  const [
    periodRows,
    serviceRowsByEvent,
    facilityRows,
    causeRows,
    serviceScopeRows,
    serviceEffectRows,
    facilityEffectRows,
  ] = await Promise.all([
    timeDbQuery('overview_q_issue_periods', () =>
      selectByIdChunks(periodEventIds, (ids) =>
        db
          .select({
            impact_event_id: impactEventPeriodsTable.impact_event_id,
            start_at: impactEventPeriodsTable.start_at,
            end_at: impactEventPeriodsTable.end_at,
          })
          .from(impactEventPeriodsTable)
          .where(inArray(impactEventPeriodsTable.impact_event_id, ids)),
      ),
    ),
    timeDbQuery('overview_q_issue_services', () =>
      selectByIdChunks(selectedStateEventIds, (ids) =>
        db
          .select({
            impact_event_id: impactEventEntityServicesTable.impact_event_id,
            service_id: impactEventEntityServicesTable.service_id,
          })
          .from(impactEventEntityServicesTable)
          .where(inArray(impactEventEntityServicesTable.impact_event_id, ids)),
      ),
    ),
    timeDbQuery('overview_q_issue_facilities', () =>
      selectByIdChunks(selectedStateEventIds, (ids) =>
        db
          .select({
            impact_event_id: impactEventEntityFacilitiesTable.impact_event_id,
            station_id: impactEventEntityFacilitiesTable.station_id,
            line_id: impactEventEntityFacilitiesTable.line_id,
          })
          .from(impactEventEntityFacilitiesTable)
          .where(
            inArray(impactEventEntityFacilitiesTable.impact_event_id, ids),
          ),
      ),
    ),
    timeDbQuery('overview_q_issue_causes', () =>
      selectByIdChunks(selectedStateEventIds, (ids) =>
        db
          .select({
            impact_event_id: impactEventCausesTable.impact_event_id,
            type: impactEventCausesTable.type,
          })
          .from(impactEventCausesTable)
          .where(inArray(impactEventCausesTable.impact_event_id, ids)),
      ),
    ),
    timeDbQuery('overview_q_issue_service_scopes', () =>
      selectByIdChunks(selectedStateEventIds, (ids) =>
        db
          .select({
            impact_event_id: impactEventServiceScopesTable.impact_event_id,
            type: impactEventServiceScopesTable.type,
            station_id: impactEventServiceScopesTable.station_id,
            from_station_id: impactEventServiceScopesTable.from_station_id,
            to_station_id: impactEventServiceScopesTable.to_station_id,
          })
          .from(impactEventServiceScopesTable)
          .where(inArray(impactEventServiceScopesTable.impact_event_id, ids)),
      ),
    ),
    timeDbQuery('overview_q_issue_service_effects', () =>
      selectByIdChunks(selectedStateEventIds, (ids) =>
        db
          .select({
            impact_event_id: impactEventServiceEffectsTable.impact_event_id,
            kind: impactEventServiceEffectsTable.kind,
          })
          .from(impactEventServiceEffectsTable)
          .where(inArray(impactEventServiceEffectsTable.impact_event_id, ids)),
      ),
    ),
    timeDbQuery('overview_q_issue_facility_effects', () =>
      selectByIdChunks(selectedStateEventIds, (ids) =>
        db
          .select({
            impact_event_id: impactEventFacilityEffectsTable.impact_event_id,
            kind: impactEventFacilityEffectsTable.kind,
          })
          .from(impactEventFacilityEffectsTable)
          .where(inArray(impactEventFacilityEffectsTable.impact_event_id, ids)),
      ),
    ),
  ]);

  const serviceIds = [
    ...new Set(serviceRowsByEvent.map((row) => row.service_id)),
  ];
  const [serviceRows, serviceRevisionRows] = await Promise.all([
    timeDbQuery('overview_q_services', () =>
      selectByIdChunks(serviceIds, (ids) =>
        db
          .select({
            id: servicesTable.id,
            line_id: servicesTable.line_id,
            name: servicesTable.name,
          })
          .from(servicesTable)
          .where(inArray(servicesTable.id, ids)),
      ),
    ),
    timeDbQuery('overview_q_service_revisions', () =>
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
    ),
  ]);
  const selectedRevisionIds = [
    ...new Set(
      serviceIds
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
        .map((revision) => revision.id),
    ),
  ];
  const servicePathRows = await timeDbQuery('overview_q_service_paths', () =>
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

  const { branchByServiceId, serviceById } = buildBranchesByServiceId({
    serviceRows,
    serviceRevisionRows,
    servicePathRows,
    referenceDate,
  });
  const periodsByImpactEventId = groupByImpactEventId(periodRows);
  const serviceRowsByImpactEventId = groupByImpactEventId(serviceRowsByEvent);
  const facilitiesByImpactEventId = groupByImpactEventId(facilityRows);
  const causesByImpactEventId = groupByImpactEventId(causeRows);
  const serviceScopesByImpactEventId = groupByImpactEventId(serviceScopeRows);
  const serviceEffectsByImpactEventId = groupByImpactEventId(serviceEffectRows);
  const facilityEffectsByImpactEventId =
    groupByImpactEventId(facilityEffectRows);
  const latestEvidenceAtByIssueId = Object.fromEntries(
    latestEvidenceRows.map((row) => [
      row.issue_id,
      row.latest_ts != null ? parseDateTime(row.latest_ts) : null,
    ]),
  );

  const issueStationIds = new Set(stationIds);
  for (const branch of Object.values(branchByServiceId)) {
    for (const stationId of branch.stationIds) {
      issueStationIds.add(stationId);
    }
  }
  for (const facility of facilityRows) {
    issueStationIds.add(facility.station_id);
  }
  for (const scope of serviceScopeRows) {
    if (scope.station_id != null) issueStationIds.add(scope.station_id);
    if (scope.from_station_id != null)
      issueStationIds.add(scope.from_station_id);
    if (scope.to_station_id != null) issueStationIds.add(scope.to_station_id);
  }

  const allStationIds = [...issueStationIds];
  const [stationRows, stationCodeRows] = await Promise.all([
    timeDbQuery('overview_q_stations', () =>
      selectByIdChunks(allStationIds, (ids) =>
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
    timeDbQuery('overview_q_station_codes', () =>
      selectByIdChunks(allStationIds, (ids) =>
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
  const stationsById = buildStationIncluded(
    stationRows,
    stationCodeRows,
    referenceDate,
  );

  const allIssues: Record<string, IssueWithOperationalEffects> = {};
  for (const row of issueRows) {
    const latestEventByType = latestEventByTypeByIssueId[row.id] ?? {};
    const selectedStateEvents = [
      latestEventByType['periods.set'],
      latestEventByType['causes.set'],
      latestEventByType['service_scopes.set'],
      latestEventByType['service_effects.set'],
      latestEventByType['facility_effects.set'],
    ].filter(
      (event): event is (typeof impactEventRows)[number] => event != null,
    );
    const serviceBranches = new Map<string, BranchWithEntries>();
    const facilityBranches = new Map<string, IssueAffectedBranch>();
    const causeSet = new Set<IssueWithOperationalEffects['subtypes'][number]>();
    const serviceScopeRowsByServiceId = new Map<
      string,
      typeof serviceScopeRows
    >();

    const serviceScopeEvent = latestEventByType['service_scopes.set'];
    if (serviceScopeEvent != null) {
      const scopeRows =
        serviceScopesByImpactEventId[serviceScopeEvent.id] ?? [];
      for (const serviceRef of serviceRowsByImpactEventId[
        serviceScopeEvent.id
      ] ?? []) {
        serviceScopeRowsByServiceId.set(serviceRef.service_id, scopeRows);
      }
    }

    for (const event of selectedStateEvents) {
      for (const cause of causesByImpactEventId[event.id] ?? []) {
        causeSet.add(cause.type);
      }

      for (const facilityRef of facilitiesByImpactEventId[event.id] ?? []) {
        const station = stationsById[facilityRef.station_id];
        if (station == null) {
          continue;
        }
        const memberships =
          facilityRef.line_id != null
            ? station.memberships.filter(
                (membership) => membership.lineId === facilityRef.line_id,
              )
            : station.memberships;

        if (
          memberships.length === 0 &&
          facilityRef.line_id != null &&
          lines[facilityRef.line_id] != null
        ) {
          facilityBranches.set(`${facilityRef.line_id}::${station.id}`, {
            lineId: facilityRef.line_id,
            branchId: `${facilityRef.line_id}:${station.id}`,
            stationIds: [station.id],
          });
        }

        for (const membership of memberships) {
          facilityBranches.set(`${membership.lineId}::${station.id}`, {
            lineId: membership.lineId,
            branchId: `${membership.lineId}:${station.id}`,
            stationIds: [station.id],
          });
        }
      }
    }

    for (const event of selectServiceBranchSourceEvents(selectedStateEvents)) {
      for (const serviceRef of serviceRowsByImpactEventId[event.id] ?? []) {
        const branch = branchByServiceId[serviceRef.service_id];
        if (branch == null) {
          continue;
        }
        serviceBranches.set(branch.id, {
          ...branch,
          stationIds: deriveServiceScopeStationIds(
            branch.stationIds,
            serviceScopeRowsByServiceId.get(serviceRef.service_id) ?? [],
          ),
        });
      }
    }

    const branchesAffected = [
      ...[...serviceBranches.values()].map((branch) => ({
        lineId: serviceById[branch.id]?.line_id ?? '',
        branchId: branch.id,
        stationIds: branch.stationIds,
      })),
      ...facilityBranches.values(),
    ].filter((branch) => branch.lineId !== '');
    const lineIds = [
      ...new Set(branchesAffected.map((branch) => branch.lineId)),
    ];
    const latestEvidenceAt = latestEvidenceAtByIssueId[row.id] ?? null;
    const intervals = resolveOperationalIssueIntervals(
      (latestEventByType['periods.set'] != null
        ? (periodsByImpactEventId[latestEventByType['periods.set'].id] ?? [])
        : []
      ).map((period) => ({
        start_at: period.start_at,
        end_at: period.end_at,
      })),
      row.type === 'infra' ? null : latestEvidenceAt,
      referenceNow,
    );

    allIssues[row.id] = {
      id: row.id,
      title: parseTranslations(row.title),
      type: row.type,
      subtypes: [...causeSet],
      durationSeconds: sumIntervalSeconds(
        intervals.map((interval) => ({
          start: parseDateTime(interval.startAt),
          end: interval.endAt != null ? parseDateTime(interval.endAt) : null,
        })),
        referenceNow,
      ),
      lineIds,
      branchesAffected,
      intervals,
      serviceEffectKinds:
        latestEventByType['service_effects.set'] != null
          ? (
              serviceEffectsByImpactEventId[
                latestEventByType['service_effects.set'].id
              ] ?? []
            ).map((effect) => effect.kind)
          : [],
      facilityEffectKinds:
        latestEventByType['facility_effects.set'] != null
          ? (
              facilityEffectsByImpactEventId[
                latestEventByType['facility_effects.set'].id
              ] ?? []
            ).map((effect) => effect.kind)
          : [],
    };
  }

  return {
    allIssues,
    included: {
      lines,
      stations: stationsById,
      operators: {},
      towns: {},
      landmarks: {},
    } satisfies BaseIncludedEntities,
  };
}

function getFactValue(
  fact: LineDayFactRow | undefined,
  key: keyof Pick<
    LineDayFactRow,
    | 'downtime_disruption_seconds'
    | 'downtime_maintenance_seconds'
    | 'downtime_infra_seconds'
    | 'issue_count_disruption'
    | 'issue_count_maintenance'
    | 'issue_count_infra'
    | 'service_seconds'
  >,
) {
  return fact?.[key] ?? 0;
}

export function buildFactBackedLineSummaries({
  days,
  facts,
  lines,
  publicHolidaySet,
  issuesByLineId,
  referenceNow,
}: {
  days: number;
  facts: LineDayFactRow[];
  lines: Record<string, Line>;
  publicHolidaySet: Set<string>;
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>;
  referenceNow: DateTime;
}) {
  const rangeStart = referenceNow.startOf('day').minus({ days: days - 1 });
  const factsByLineDate = new Map<string, LineDayFactRow>();
  for (const fact of facts) {
    factsByLineDate.set(`${fact.line_id}::${fact.date}`, fact);
  }

  const lineSummaries = Object.values(lines).map((line) => {
    const breakdownByDates: LineSummary['breakdownByDates'] = {};
    const durationSecondsByIssueType: LineSummary['durationSecondsByIssueType'] =
      {};
    const lineIssues = issuesByLineId[line.id] ?? [];
    let totalServiceSeconds = 0;
    let totalDowntimeSeconds = 0;

    for (let offset = 0; offset < days; offset++) {
      const date = rangeStart.plus({ days: offset });
      const dateKey = isoDate(date);
      const dayWindow = serviceWindowForDate(line, date, publicHolidaySet);
      const calendarDayStart = date.startOf('day');
      const calendarDayEnd = calendarDayStart.plus({ days: 1 });
      const allocationWindow = {
        start:
          dayWindow.start > calendarDayStart
            ? dayWindow.start
            : calendarDayStart,
        end: dayWindow.end < calendarDayEnd ? dayWindow.end : calendarDayEnd,
      };
      const fact = factsByLineDate.get(`${line.id}::${dateKey}`);
      const disruptionSeconds = getFactValue(
        fact,
        'downtime_disruption_seconds',
      );
      const maintenanceSeconds = getFactValue(
        fact,
        'downtime_maintenance_seconds',
      );
      const infraSeconds = getFactValue(fact, 'downtime_infra_seconds');
      const serviceSeconds = getFactValue(fact, 'service_seconds');
      totalServiceSeconds += serviceSeconds;
      totalDowntimeSeconds +=
        disruptionSeconds + maintenanceSeconds + infraSeconds;
      durationSecondsByIssueType.disruption =
        (durationSecondsByIssueType.disruption ?? 0) + disruptionSeconds;
      durationSecondsByIssueType.maintenance =
        (durationSecondsByIssueType.maintenance ?? 0) + maintenanceSeconds;
      durationSecondsByIssueType.infra =
        (durationSecondsByIssueType.infra ?? 0) + infraSeconds;

      const breakdownByIssueTypes = buildIssueTypeBreakdownForDate(
        lineIssues,
        date,
        referenceNow,
        allocationWindow,
      );
      if (breakdownByIssueTypes.disruption == null && disruptionSeconds > 0) {
        breakdownByIssueTypes.disruption = {
          totalDurationSeconds: disruptionSeconds,
          issueIds: [],
        };
      }
      if (breakdownByIssueTypes.maintenance == null && maintenanceSeconds > 0) {
        breakdownByIssueTypes.maintenance = {
          totalDurationSeconds: maintenanceSeconds,
          issueIds: [],
        };
      }
      if (breakdownByIssueTypes.infra == null && infraSeconds > 0) {
        breakdownByIssueTypes.infra = {
          totalDurationSeconds: infraSeconds,
          issueIds: [],
        };
      }

      breakdownByDates[dateKey] = {
        breakdownByIssueTypes,
        dayType: lineDayType(date, publicHolidaySet),
      };
    }

    const activeNowIssues = lineIssues.filter((issue) =>
      issueActiveNow(issue, referenceNow),
    );
    const status = (() => {
      if (isLineFuture(line, referenceNow)) {
        return 'future_service';
      }
      if (!isLineOperatingNow(line, publicHolidaySet, referenceNow)) {
        return 'closed_for_day';
      }
      if (activeNowIssues.some((issue) => issue.type === 'disruption')) {
        return 'ongoing_disruption';
      }
      if (activeNowIssues.some((issue) => issue.type === 'maintenance')) {
        return 'ongoing_maintenance';
      }
      if (activeNowIssues.some((issue) => issue.type === 'infra')) {
        return 'ongoing_infra';
      }
      return 'normal';
    })();

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
      totalDowntimeSeconds:
        totalServiceSeconds > 0 ? totalDowntimeSeconds : null,
      downtimeBreakdown:
        totalServiceSeconds > 0
          ? (['disruption', 'maintenance', 'infra'] as const).map((type) => ({
              type,
              downtimeSeconds: durationSecondsByIssueType[type] ?? 0,
            }))
          : null,
      uptimeRank: null,
      totalLines: null,
    } satisfies LineSummary;
  });

  return rankLineSummaries(lineSummaries);
}

function groupIssuesByLineId(issues: Iterable<IssueWithOperationalEffects>) {
  const grouped: Record<string, IssueWithOperationalEffects[]> = {};
  for (const issue of issues) {
    for (const lineId of issue.lineIds) {
      grouped[lineId] ??= [];
      grouped[lineId].push(issue);
    }
  }
  return grouped;
}

export async function getOverviewData(
  days: number,
  options: CommunitySignalOptions = {},
) {
  return timeServerSpan('overview_data', async () => {
    const db = await getDefaultDb();
    return getOverviewDataFromDb(db, days, options);
  });
}

export async function getOverviewDataFromDb(
  db: OverviewDb,
  days: number,
  options: CommunitySignalOptions = {},
  referenceNow = nowSg(),
) {
  const rangeStart = referenceNow.startOf('day').minus({ days: days - 1 });
  const rangeEnd = referenceNow.startOf('day');
  const todayStart = referenceNow.startOf('day');
  const todayEnd = todayStart.plus({ days: 1 });

  const [
    lines,
    publicHolidaySet,
    lineDayFacts,
    candidateIssueIdsInRange,
    communitySignals,
  ] = await Promise.all([
    getLinesFromDb(db),
    getPublicHolidaySetFromDb(db),
    getLineDayFactsFromDb(db, rangeStart, rangeEnd),
    getIssueIdsOverlappingRange(db, rangeStart, todayEnd),
    options.includeCommunitySignals
      ? getPublicCrowdReportSignals(db, {})
      : Promise.resolve([]),
  ]);
  const candidateIssueIds = [...new Set(candidateIssueIdsInRange)];
  const communitySignalStationIds = [
    ...new Set(communitySignals.flatMap((signal) => signal.stationIds)),
  ];
  const needsIssueHydration =
    candidateIssueIds.length > 0 || communitySignalStationIds.length > 0;
  const issueHydration = needsIssueHydration
    ? await timeServerSpan('overview_active_issue_hydration', () =>
        getOverviewIssueHydrationFromDb({
          db,
          issueIds: candidateIssueIds,
          lines,
          referenceNow,
          stationIds: communitySignalStationIds,
        }),
      )
    : null;
  const allIssues = issueHydration?.allIssues ?? {};
  const issues = Object.values(allIssues);
  const issueIdsActiveNow = issues
    .filter(
      (issue) =>
        issue.type === 'disruption' && issueActiveNow(issue, referenceNow),
    )
    .map((issue) => issue.id);
  const issueIdsActiveToday = issues
    .filter(
      (issue) =>
        (issue.type === 'maintenance' || issue.type === 'infra') &&
        issueActiveToday(issue, referenceNow),
    )
    .map((issue) => issue.id);
  const issuesByLineId = groupIssuesByLineId(issues);
  const lineSummaries = timeSyncServerSpan('overview_line_summaries', () =>
    buildFactBackedLineSummaries({
      days,
      facts: lineDayFacts as LineDayFactRow[],
      lines,
      publicHolidaySet,
      issuesByLineId,
      referenceNow,
    }),
  );
  const lineSummaryIssueIds = [
    ...new Set(
      lineSummaries.flatMap((summary) =>
        Object.values(summary.breakdownByDates).flatMap((entry) =>
          Object.values(entry.breakdownByIssueTypes).flatMap(
            (breakdown) => breakdown.issueIds,
          ),
        ),
      ),
    ),
  ];

  const baseIncluded = issueHydration?.included ?? emptyIncluded(lines);
  const selectedIncluded: IncludedEntities =
    issueHydration == null
      ? ({
          ...baseIncluded,
          issues: {},
        } satisfies IncludedEntities)
      : selectIncludedEntities(baseIncluded, allIssues, {
          issueIds: [
            ...new Set([
              ...issueIdsActiveNow,
              ...issueIdsActiveToday,
              ...lineSummaryIssueIds,
            ]),
          ],
          lineIds: lineSummaries.map((summary) => summary.lineId),
          stationIds: communitySignalStationIds,
          includeStationMembershipLines: true,
        });

  return {
    data: {
      issueIdsActiveNow,
      issueIdsActiveToday,
      lineSummaries,
      communitySignals,
    },
    included: {
      ...selectedIncluded,
      lines: {
        ...lines,
        ...selectedIncluded.lines,
      },
      issues: selectedIncluded.issues,
    },
  };
}
