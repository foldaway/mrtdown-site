import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import {
  evidencesTable,
  impactEventCausesTable,
  impactEventEntityFacilitiesTable,
  impactEventFacilityEffectsTable,
  impactEventPeriodsTable,
  impactEventServiceEffectsTable,
  impactEventServiceScopesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  issuesTable,
  landmarksTable,
  lineOperatorsTable,
  linesTable,
  metadataTable,
  operatorsTable,
  publicHolidaysTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesTable,
  stationCodesTable,
  stationLandmarksTable,
  stationsTable,
  townsTable,
} from '~/db/schema';
import type {
  IncludedEntities,
  Issue,
  IssueAffectedBranch,
  Line,
  Station,
} from '~/types';
import {
  deriveLineStartedAtFromBranches,
  sortLineBranchesForCurrentView,
} from '~/util/lineBranches';
import { recordServerTiming, timeServerSpan } from '~/util/serverTiming';
import {
  selectServiceRevisionForReferenceDate,
  serviceRevisionHasEnded,
} from '~/util/serviceRevisions';
import { selectIncludedEntities } from './included';
import {
  resolveOperationalIssueIntervals,
  sumIntervalSeconds,
} from './issueIntervals';
import { buildIssuesByLineId } from './lineSummaries';
import {
  deriveServiceScopeStationIds,
  selectServiceBranchSourceEvents,
} from './serviceScopes';
import {
  getDefaultDb,
  parseTranslations,
  publicMetadataKeySql,
  selectByIdChunks,
  timeDbQuery,
} from './shared';
import { isoDate, isoDateTime, nowSg, parseDateTime } from './temporal';
import type {
  BaseDataset,
  BranchWithEntries,
  IssueWithOperationalEffects,
  OverviewDataset,
} from './types';

const BASE_DATASET_CACHE_TTL_MS = 5 * 60_000;
let cachedBaseDataset:
  | {
      expiresAt: number;
      value: BaseDataset;
    }
  | undefined;
let pendingBaseDataset: Promise<BaseDataset> | undefined;
const cachedOverviewDatasets = new Map<
  number,
  {
    expiresAt: number;
    value: OverviewDataset;
  }
>();
const pendingOverviewDatasets = new Map<number, Promise<OverviewDataset>>();

export async function buildDataset(
  referenceNow = nowSg(),
  db?: AppDb,
  issueIds?: readonly string[],
): Promise<BaseDataset> {
  // Migration-only fallback. New request-path queries should be route-shaped
  // and must not add callers to `buildDataset` or `getBaseDataset`.
  const database =
    db ?? (await timeServerSpan('db_connect', () => getDefaultDb()));
  const selectedIssueIds =
    issueIds == null ? undefined : [...new Set(issueIds)];

  const [
    metadataRows,
    linesRows,
    lineOperatorsRows,
    operatorsRows,
    townsRows,
    landmarksRows,
    stationRows,
    stationCodesRows,
    stationLandmarksRows,
    serviceRows,
    serviceRevisionRows,
    publicHolidayRows,
    issueRows,
    latestEvidenceRows,
    impactEventRows,
  ] = await timeServerSpan('dataset_base_queries', () =>
    Promise.all([
      timeDbQuery('dataset_q_metadata', () =>
        database.select().from(metadataTable).where(publicMetadataKeySql()),
      ),
      timeDbQuery('dataset_q_lines', () => database.select().from(linesTable)),
      timeDbQuery('dataset_q_line_operators', () =>
        database.select().from(lineOperatorsTable),
      ),
      timeDbQuery('dataset_q_operators', () =>
        database.select().from(operatorsTable),
      ),
      timeDbQuery('dataset_q_towns', () => database.select().from(townsTable)),
      timeDbQuery('dataset_q_landmarks', () =>
        database.select().from(landmarksTable),
      ),
      timeDbQuery('dataset_q_stations', () =>
        database
          .select({
            id: stationsTable.id,
            name: stationsTable.name,
            townId: stationsTable.townId,
            latitude: stationsTable.latitude,
            longitude: stationsTable.longitude,
          })
          .from(stationsTable),
      ),
      timeDbQuery('dataset_q_station_codes', () =>
        database.select().from(stationCodesTable),
      ),
      timeDbQuery('dataset_q_station_landmarks', () =>
        database.select().from(stationLandmarksTable),
      ),
      timeDbQuery('dataset_q_services', () =>
        database.select().from(servicesTable),
      ),
      timeDbQuery('dataset_q_service_revisions', () =>
        database.select().from(serviceRevisionsTable),
      ),
      timeDbQuery('dataset_q_public_holidays', () =>
        database.select().from(publicHolidaysTable),
      ),
      selectedIssueIds == null
        ? timeDbQuery('dataset_q_issues', () =>
            database.select().from(issuesTable),
          )
        : timeDbQuery('dataset_q_issues', () =>
            selectByIdChunks(selectedIssueIds, (ids) =>
              database
                .select()
                .from(issuesTable)
                .where(inArray(issuesTable.id, ids)),
            ),
          ),
      selectedIssueIds == null
        ? timeDbQuery('dataset_q_latest_evidence', () =>
            database
              .select({
                issue_id: evidencesTable.issue_id,
                latest_ts: sql<string>`max(${evidencesTable.ts})`,
              })
              .from(evidencesTable)
              .groupBy(evidencesTable.issue_id),
          )
        : timeDbQuery('dataset_q_latest_evidence', () =>
            selectByIdChunks(selectedIssueIds, (ids) =>
              database
                .select({
                  issue_id: evidencesTable.issue_id,
                  latest_ts: sql<string>`max(${evidencesTable.ts})`,
                })
                .from(evidencesTable)
                .where(inArray(evidencesTable.issue_id, ids))
                .groupBy(evidencesTable.issue_id),
            ),
          ),
      selectedIssueIds == null
        ? timeDbQuery('dataset_q_impact_events', () =>
            database.select().from(impactEventsTable),
          )
        : timeDbQuery('dataset_q_impact_events', () =>
            selectByIdChunks(selectedIssueIds, (ids) =>
              database
                .select()
                .from(impactEventsTable)
                .where(inArray(impactEventsTable.issue_id, ids)),
            ),
          ),
    ]),
  );

  const latestEventByTypeByIssueId = impactEventRows.reduce<
    Record<
      string,
      Partial<
        Record<
          (typeof impactEventRows)[number]['type'],
          (typeof impactEventRows)[number]
        >
      >
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
  const periodImpactEventIds = [
    ...new Set(
      Object.values(latestEventByTypeByIssueId)
        .map((latestEventByType) => latestEventByType['periods.set']?.id)
        .filter((eventId): eventId is string => eventId != null),
    ),
  ];
  const [
    impactEventPeriodRows,
    impactEventServiceRows,
    impactEventFacilityRows,
    impactEventCauseRows,
    impactEventServiceScopeRows,
    impactEventServiceEffectRows,
    impactEventFacilityEffectRows,
  ] = await timeServerSpan('dataset_issue_detail_queries', () =>
    Promise.all([
      timeDbQuery('dataset_q_impact_event_periods', () =>
        selectByIdChunks(periodImpactEventIds, (ids) =>
          database
            .select()
            .from(impactEventPeriodsTable)
            .where(inArray(impactEventPeriodsTable.impact_event_id, ids)),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_services', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventEntityServicesTable)
            .where(
              inArray(impactEventEntityServicesTable.impact_event_id, ids),
            ),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_facilities', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventEntityFacilitiesTable)
            .where(
              inArray(impactEventEntityFacilitiesTable.impact_event_id, ids),
            ),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_causes', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventCausesTable)
            .where(inArray(impactEventCausesTable.impact_event_id, ids)),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_service_scopes', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventServiceScopesTable)
            .where(inArray(impactEventServiceScopesTable.impact_event_id, ids)),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_service_effects', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventServiceEffectsTable)
            .where(
              inArray(impactEventServiceEffectsTable.impact_event_id, ids),
            ),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_facility_effects', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventFacilityEffectsTable)
            .where(
              inArray(impactEventFacilityEffectsTable.impact_event_id, ids),
            ),
        ),
      ),
    ]),
  );

  const metadata = Object.fromEntries(
    metadataRows.map((row) => [row.key, row.value]),
  );
  const publicHolidaySet = new Set(publicHolidayRows.map((row) => row.date));
  const referenceDate = isoDate(referenceNow);

  const operatorsById = Object.fromEntries(
    operatorsRows.map((row) => {
      const name = parseTranslations(row.name);
      const operator: IncludedEntities['operators'][string] = {
        id: row.id,
        name,
        foundedAt: row.founded_at,
        url: row.url,
      };
      return [row.id, operator];
    }),
  );

  const townsById = Object.fromEntries(
    townsRows.map((row) => {
      const name = parseTranslations(row.name);
      return [
        row.id,
        {
          id: row.id,
          name,
        },
      ];
    }),
  ) as IncludedEntities['towns'];

  const landmarksById = Object.fromEntries(
    landmarksRows.map((row) => {
      const name = parseTranslations(row.name);
      return [
        row.id,
        {
          id: row.id,
          name,
        },
      ];
    }),
  ) as IncludedEntities['landmarks'];

  const operatorIdsByLineId = lineOperatorsRows.reduce<
    Record<string, Line['operators']>
  >((acc, row) => {
    if (acc[row.line_id] == null) {
      acc[row.line_id] = [];
    }
    acc[row.line_id].push({
      operatorId: row.operator_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    });
    return acc;
  }, {});

  const linesById = Object.fromEntries(
    linesRows.map((row) => {
      const name = parseTranslations(row.name);
      const line: Line = {
        id: row.id,
        name,
        type: row.type,
        color: row.color,
        startedAt: row.started_at,
        operatingHours: row.operating_hours,
        operators: operatorIdsByLineId[row.id] ?? [],
      };
      return [row.id, line];
    }),
  ) as IncludedEntities['lines'];

  const revisionsByServiceId = serviceRevisionRows.reduce<
    Record<string, typeof serviceRevisionRows>
  >((acc, row) => {
    if (acc[row.service_id] == null) {
      acc[row.service_id] = [];
    }
    acc[row.service_id].push(row);
    return acc;
  }, {});

  const revisionForReferenceDateByServiceId = Object.fromEntries(
    Object.entries(revisionsByServiceId)
      .map(([serviceId, revisions]) => {
        const revision = selectServiceRevisionForReferenceDate(
          revisions,
          referenceDate,
        );
        return revision == null ? null : ([serviceId, revision] as const);
      })
      .filter(
        (
          entry,
        ): entry is readonly [string, (typeof serviceRevisionRows)[number]] =>
          entry != null,
      ),
  );

  const allRevisionIds = [
    ...new Set(serviceRevisionRows.map((revision) => revision.id)),
  ];
  const servicePathRows = await timeServerSpan(
    'dataset_service_path_query',
    () =>
      selectByIdChunks(allRevisionIds, (ids) =>
        database
          .select()
          .from(serviceRevisionPathStationEntriesTable)
          .where(
            inArray(
              serviceRevisionPathStationEntriesTable.service_revision_id,
              ids,
            ),
          ),
      ),
  );
  const assemblyStartedAt = performance.now();

  const pathEntriesByRevisionKey = servicePathRows.reduce<
    Record<string, typeof servicePathRows>
  >((acc, row) => {
    const key = `${row.service_revision_id}::${row.service_id}`;
    if (acc[key] == null) {
      acc[key] = [];
    }
    acc[key].push(row);
    return acc;
  }, {});

  const latestRevisionByServiceId = Object.fromEntries(
    serviceRows
      .map((service) => {
        const revisions = revisionsByServiceId[service.id] ?? [];
        const revisionsWithPath = revisions.filter((revision) => {
          const revisionKey = `${revision.id}::${service.id}`;
          const entries = pathEntriesByRevisionKey[revisionKey] ?? [];
          return entries.length > 0;
        });
        const revisionForReferenceDate = selectServiceRevisionForReferenceDate(
          revisionsWithPath,
          referenceDate,
        );
        if (revisionForReferenceDate == null) {
          return null;
        }

        return [service.id, revisionForReferenceDate] as const;
      })
      .filter(
        (
          entry,
        ): entry is readonly [string, (typeof serviceRevisionRows)[number]] =>
          entry != null,
      ),
  );

  const stationCodeLookup = new Map<
    string,
    (typeof stationCodesRows)[number]
  >();
  const serviceById = Object.fromEntries(
    serviceRows.map((service) => [service.id, service]),
  ) as Record<string, (typeof serviceRows)[number]>;
  for (const row of stationCodesRows) {
    stationCodeLookup.set(
      `${row.station_id}::${row.line_id}::${row.code}`,
      row,
    );
  }

  const branchesByLineId: Record<string, BranchWithEntries[]> = {};
  const branchByServiceId: Record<string, BranchWithEntries> = {};

  for (const service of serviceRows) {
    const latestRevision = latestRevisionByServiceId[service.id];
    if (latestRevision == null) continue;

    const revisionKey = `${latestRevision.id}::${service.id}`;
    const entries = [...(pathEntriesByRevisionKey[revisionKey] ?? [])].sort(
      (a, b) => a.path_index - b.path_index,
    );

    if (entries.length === 0) {
      continue;
    }

    const startedDates = entries
      .map(
        (entry) =>
          stationCodeLookup.get(
            `${entry.station_id}::${service.line_id}::${entry.display_code}`,
          )?.started_at,
      )
      .filter((value): value is string => value != null)
      .map((value) => parseDateTime(value));

    const endedDates = entries
      .map(
        (entry) =>
          stationCodeLookup.get(
            `${entry.station_id}::${service.line_id}::${entry.display_code}`,
          )?.ended_at,
      )
      .filter((value): value is string => value != null)
      .map((value) => parseDateTime(value));

    const name = parseTranslations(service.name);
    const revisionStartDate =
      latestRevision.start_at != null
        ? parseDateTime(latestRevision.start_at)
        : null;
    const minStart = startedDates.sort(
      (a, b) => a.toMillis() - b.toMillis(),
    )[0];
    const effectiveStart = revisionStartDate ?? minStart ?? null;
    const branch: BranchWithEntries = {
      id: service.id,
      name,
      startedAt:
        effectiveStart != null && effectiveStart <= referenceNow
          ? effectiveStart.toISODate()
          : null,
      endedAt: (() => {
        const endedAtByStationCode =
          endedDates.length === entries.length
            ? (endedDates
                .sort((a, b) => b.toMillis() - a.toMillis())[0]
                ?.toISODate() ?? null)
            : null;
        if (
          endedAtByStationCode != null &&
          endedAtByStationCode < referenceDate
        ) {
          return endedAtByStationCode;
        }
        if (serviceRevisionHasEnded(latestRevision, referenceDate)) {
          return latestRevision.end_at;
        }

        const overallRevision = revisionForReferenceDateByServiceId[service.id];
        if (
          overallRevision != null &&
          overallRevision.id !== latestRevision.id &&
          serviceRevisionHasEnded(overallRevision, referenceDate)
        ) {
          return overallRevision.end_at;
        }

        return null;
      })(),
      stationIds: [...new Set(entries.map((entry) => entry.station_id))],
      entries: entries.map((entry) => ({
        stationId: entry.station_id,
        displayCode: entry.display_code,
        pathIndex: entry.path_index,
      })),
    };

    branchByServiceId[service.id] = branch;
    if (branchesByLineId[service.line_id] == null) {
      branchesByLineId[service.line_id] = [];
    }
    branchesByLineId[service.line_id].push(branch);
  }

  const membershipByStationId: Record<string, Station['memberships']> = {};

  for (const [lineId, branches] of Object.entries(branchesByLineId)) {
    const sortedBranches = sortLineBranchesForCurrentView(branches);
    branchesByLineId[lineId] = sortedBranches;
    const line = linesById[lineId];
    if (line != null) {
      line.startedAt = deriveLineStartedAtFromBranches(
        line.startedAt,
        sortedBranches,
      );
    }

    for (const branch of sortedBranches) {
      branch.entries.forEach((entry, index) => {
        if (membershipByStationId[entry.stationId] == null) {
          membershipByStationId[entry.stationId] = [];
        }

        const codeInfo = stationCodeLookup.get(
          `${entry.stationId}::${lineId}::${entry.displayCode}`,
        );

        const membership = {
          lineId,
          branchId: branch.id,
          code: entry.displayCode,
          startedAt:
            codeInfo?.started_at ??
            linesById[lineId]?.startedAt ??
            '1970-01-01',
          endedAt:
            codeInfo?.ended_at != null && codeInfo.ended_at < referenceDate
              ? codeInfo.ended_at
              : undefined,
          structureType: codeInfo?.structure_type ?? 'underground',
          sequenceOrder: index,
        };

        const existing = membershipByStationId[entry.stationId].some(
          (candidate) =>
            candidate.lineId === membership.lineId &&
            candidate.branchId === membership.branchId &&
            candidate.code === membership.code,
        );
        if (!existing) {
          membershipByStationId[entry.stationId].push(membership);
        }
      });
    }
  }

  for (const code of stationCodesRows) {
    if (membershipByStationId[code.station_id] == null) {
      membershipByStationId[code.station_id] = [];
    }

    const existing = membershipByStationId[code.station_id].some(
      (membership) =>
        membership.lineId === code.line_id && membership.code === code.code,
    );
    if (existing) {
      continue;
    }

    membershipByStationId[code.station_id].push({
      lineId: code.line_id,
      branchId: `${code.line_id}:${code.code}`,
      code: code.code,
      startedAt: code.started_at,
      endedAt:
        code.ended_at != null && code.ended_at < referenceDate
          ? code.ended_at
          : undefined,
      structureType: code.structure_type,
      sequenceOrder: 0,
    });
  }

  const landmarkIdsByStationId = stationLandmarksRows.reduce<
    Record<string, string[]>
  >((acc, row) => {
    if (acc[row.station_id] == null) {
      acc[row.station_id] = [];
    }
    acc[row.station_id].push(row.landmark_id);
    return acc;
  }, {});

  const stationsById = Object.fromEntries(
    stationRows.map((row) => {
      const name = parseTranslations(row.name);
      const station: Station = {
        id: row.id,
        name,
        geo: {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        },
        memberships: (membershipByStationId[row.id] ?? []).sort((a, b) => {
          if (a.lineId !== b.lineId) {
            return a.lineId.localeCompare(b.lineId);
          }
          return a.sequenceOrder - b.sequenceOrder;
        }),
        townId: row.townId,
        landmarkIds: landmarkIdsByStationId[row.id] ?? [],
      };
      return [row.id, station];
    }),
  ) as IncludedEntities['stations'];

  const periodsByImpactEventId = impactEventPeriodRows.reduce<
    Record<string, typeof impactEventPeriodRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const serviceRowsByImpactEventId = impactEventServiceRows.reduce<
    Record<string, typeof impactEventServiceRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const facilityRowsByImpactEventId = impactEventFacilityRows.reduce<
    Record<string, typeof impactEventFacilityRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const causesByImpactEventId = impactEventCauseRows.reduce<
    Record<string, typeof impactEventCauseRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const serviceScopesByImpactEventId = impactEventServiceScopeRows.reduce<
    Record<string, typeof impactEventServiceScopeRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const serviceEffectsByImpactEventId = impactEventServiceEffectRows.reduce<
    Record<string, typeof impactEventServiceEffectRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const facilityEffectsByImpactEventId = impactEventFacilityEffectRows.reduce<
    Record<string, typeof impactEventFacilityEffectRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const latestEvidenceAtByIssueId = Object.fromEntries(
    latestEvidenceRows.map((row) => [
      row.issue_id,
      row.latest_ts != null ? parseDateTime(row.latest_ts) : null,
    ]),
  ) as Record<string, DateTime | null>;

  const allIssues: Record<string, IssueWithOperationalEffects> = {};
  for (const row of issueRows) {
    const title = parseTranslations(row.title);
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
    const serviceBranches = new Map<string, IssueAffectedBranch>();
    const facilityBranches = new Map<string, IssueAffectedBranch>();
    const causeSet = new Set<Issue['subtypes'][number]>();
    const serviceScopeRowsByServiceId = new Map<
      string,
      typeof impactEventServiceScopeRows
    >();

    const periodEvents =
      latestEventByType['periods.set'] != null
        ? [latestEventByType['periods.set']]
        : [];
    const canonicalPeriods = periodEvents.flatMap((event) => {
      return periodsByImpactEventId[event.id] ?? [];
    });

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
        causeSet.add(cause.type as Issue['subtypes'][number]);
      }

      for (const facilityRef of facilityRowsByImpactEventId[event.id] ?? []) {
        const station = stationsById[facilityRef.station_id];
        if (station == null) {
          continue;
        }

        const stationMemberships =
          facilityRef.line_id != null
            ? station.memberships.filter(
                (membership) => membership.lineId === facilityRef.line_id,
              )
            : station.memberships;

        if (
          stationMemberships.length === 0 &&
          facilityRef.line_id != null &&
          linesById[facilityRef.line_id] != null
        ) {
          const key = `${facilityRef.line_id}::${station.id}`;
          if (!facilityBranches.has(key)) {
            facilityBranches.set(key, {
              lineId: facilityRef.line_id,
              branchId: `${facilityRef.line_id}:${station.id}`,
              stationIds: [station.id],
            });
          }
        }

        for (const membership of stationMemberships) {
          const key = `${membership.lineId}::${station.id}`;
          if (!facilityBranches.has(key)) {
            facilityBranches.set(key, {
              lineId: membership.lineId,
              branchId: `${membership.lineId}:${station.id}`,
              stationIds: [station.id],
            });
          }
        }
      }
    }

    for (const event of selectServiceBranchSourceEvents(selectedStateEvents)) {
      for (const serviceRef of serviceRowsByImpactEventId[event.id] ?? []) {
        const branch = branchByServiceId[serviceRef.service_id];
        const service = serviceById[serviceRef.service_id];
        if (branch == null || service == null) {
          continue;
        }
        serviceBranches.set(branch.id, {
          lineId: service.line_id,
          branchId: branch.id,
          stationIds: deriveServiceScopeStationIds(
            branch.stationIds,
            serviceScopeRowsByServiceId.get(serviceRef.service_id) ?? [],
          ),
        });
      }
    }

    const branchesAffected = [
      ...serviceBranches.values(),
      ...facilityBranches.values(),
    ]
      .map((branch) => {
        if (branch.lineId !== '') {
          return branch;
        }
        const resolvedBranch = branchByServiceId[branch.branchId];
        return {
          ...branch,
          lineId:
            resolvedBranch != null
              ? (serviceRows.find((service) => service.id === resolvedBranch.id)
                  ?.line_id ?? branch.lineId)
              : branch.lineId,
        };
      })
      .filter((branch) => branch.lineId !== '');

    const lineIds = [
      ...new Set(branchesAffected.map((branch) => branch.lineId)),
    ];
    const latestEvidenceAt = latestEvidenceAtByIssueId[row.id];
    const intervals = resolveOperationalIssueIntervals(
      canonicalPeriods.map((period) => ({
        start_at: period.start_at,
        end_at: period.end_at,
      })),
      row.type === 'infra' ? null : latestEvidenceAt,
      referenceNow,
    );

    const durationSeconds = sumIntervalSeconds(
      intervals.map((interval) => ({
        start: parseDateTime(interval.startAt),
        end: interval.endAt != null ? parseDateTime(interval.endAt) : null,
      })),
      referenceNow,
    );

    const serviceEffectKinds =
      latestEventByType['service_effects.set'] != null
        ? (
            serviceEffectsByImpactEventId[
              latestEventByType['service_effects.set'].id
            ] ?? []
          ).map((row) => row.kind)
        : [];

    const facilityEffectKinds =
      latestEventByType['facility_effects.set'] != null
        ? (
            facilityEffectsByImpactEventId[
              latestEventByType['facility_effects.set'].id
            ] ?? []
          ).map((row) => row.kind)
        : [];

    allIssues[row.id] = {
      id: row.id,
      title,
      type: row.type,
      subtypes: [...causeSet],
      durationSeconds,
      lineIds,
      branchesAffected,
      intervals,
      serviceEffectKinds,
      facilityEffectKinds,
    };
  }

  const issuesByLineId = buildIssuesByLineId(Object.values(allIssues));
  recordServerTiming('dataset_assembly', performance.now() - assemblyStartedAt);

  return {
    included: {
      lines: linesById,
      stations: stationsById,
      operators: operatorsById,
      towns: townsById,
      landmarks: landmarksById,
    },
    branchesByLineId,
    branchByServiceId,
    metadata,
    publicHolidaySet,
    allIssues,
    issuesByLineId,
  };
}

export async function buildBaseDataset(
  referenceNow = nowSg(),
  db?: AppDb,
): Promise<BaseDataset> {
  return timeServerSpan('build_dataset', () => buildDataset(referenceNow, db));
}

export async function getBaseDataset() {
  // Migration-only process-local cache around broad dataset assembly.
  // Route reads should move away from this path during query decomposition.
  const now = Date.now();
  if (cachedBaseDataset != null && cachedBaseDataset.expiresAt > now) {
    recordServerTiming('base_dataset', 0, 'cache=hit');
    return cachedBaseDataset.value;
  }

  const startedAt = performance.now();
  const cacheState = pendingBaseDataset == null ? 'miss' : 'pending';
  pendingBaseDataset ??= buildBaseDataset()
    .then((dataset) => {
      cachedBaseDataset = {
        expiresAt: Date.now() + BASE_DATASET_CACHE_TTL_MS,
        value: dataset,
      };
      return dataset;
    })
    .finally(() => {
      pendingBaseDataset = undefined;
    });

  try {
    return await pendingBaseDataset;
  } finally {
    recordServerTiming(
      'base_dataset',
      performance.now() - startedAt,
      `cache=${cacheState}`,
    );
  }
}

async function getOverviewIssueIds(
  days: number,
  referenceNow = nowSg(),
  db?: AppDb,
) {
  const database = db ?? (await getDefaultDb());
  const rangeStart = referenceNow.startOf('day').minus({ days: days - 1 });
  const rangeEnd = referenceNow.startOf('day').plus({ days: 1 });
  const overlappingPeriodRows = await timeDbQuery(
    'overview_q_overlapping_periods',
    () =>
      database
        .select({
          impact_event_id: impactEventPeriodsTable.impact_event_id,
        })
        .from(impactEventPeriodsTable)
        .where(
          sql`${impactEventPeriodsTable.start_at} < ${isoDateTime(rangeEnd)} and (${impactEventPeriodsTable.end_at} is null or ${impactEventPeriodsTable.end_at} > ${isoDateTime(rangeStart)})`,
        ),
  );
  const overlappingPeriodEventIds = [
    ...new Set(overlappingPeriodRows.map((row) => row.impact_event_id)),
  ];
  const overlappingPeriodEventRows = await timeDbQuery(
    'overview_q_period_events_for_overlap',
    () =>
      selectByIdChunks(overlappingPeriodEventIds, (ids) =>
        database
          .select({
            id: impactEventsTable.id,
            issue_id: impactEventsTable.issue_id,
            ts: impactEventsTable.ts,
          })
          .from(impactEventsTable)
          .where(inArray(impactEventsTable.id, ids)),
      ),
  );
  const overlappingPeriodEventIdSet = new Set(overlappingPeriodEventIds);
  const candidateIssueIds = [
    ...new Set(overlappingPeriodEventRows.map((event) => event.issue_id)),
  ];
  const periodEventRows = await timeDbQuery(
    'overview_q_period_events_for_issues',
    () =>
      selectByIdChunks(candidateIssueIds, (ids) =>
        database
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
  const issueIds = new Set<string>();
  for (const event of Object.values(latestPeriodEventByIssueId)) {
    if (overlappingPeriodEventIdSet.has(event.id)) {
      issueIds.add(event.issue_id);
    }
  }

  return [...issueIds];
}

async function buildOverviewDataset(
  days: number,
  referenceNow = nowSg(),
  db?: AppDb,
): Promise<OverviewDataset> {
  return timeServerSpan('build_overview_dataset', async () => {
    const database = db ?? (await getDefaultDb());
    const issueIds = await timeServerSpan('overview_issue_candidates', () =>
      getOverviewIssueIds(days, referenceNow, database),
    );
    const dataset = await buildDataset(referenceNow, database, issueIds);
    return {
      included: dataset.included,
      publicHolidaySet: dataset.publicHolidaySet,
      allIssues: dataset.allIssues,
      issuesByLineId: dataset.issuesByLineId,
    };
  });
}

export async function getOverviewDataset(days: number) {
  const now = Date.now();
  const cached = cachedOverviewDatasets.get(days);
  if (cached != null && cached.expiresAt > now) {
    recordServerTiming('overview_dataset', 0, 'cache=hit');
    return cached.value;
  }

  const startedAt = performance.now();
  const cacheState = pendingOverviewDatasets.has(days) ? 'pending' : 'miss';
  let pending = pendingOverviewDatasets.get(days);
  if (pending == null) {
    pending = buildOverviewDataset(days)
      .then((dataset) => {
        cachedOverviewDatasets.set(days, {
          expiresAt: Date.now() + BASE_DATASET_CACHE_TTL_MS,
          value: dataset,
        });
        return dataset;
      })
      .finally(() => {
        pendingOverviewDatasets.delete(days);
      });
    pendingOverviewDatasets.set(days, pending);
  }

  try {
    return await pending;
  } finally {
    recordServerTiming(
      'overview_dataset',
      performance.now() - startedAt,
      `cache=${cacheState}`,
    );
  }
}

export async function getIncludedForIssueIds(issueIds: readonly string[]) {
  const dataset = await buildDataset(nowSg(), undefined, issueIds);
  return selectIncludedEntities(dataset.included, dataset.allIssues, {
    issueIds,
    includeStationMembershipLines: true,
  });
}
