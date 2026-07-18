import type { Service as CoreService } from '@mrtdown/core';
import { inArray, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
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
  type AffectedServiceRevision,
  selectAffectedServiceRevisionForReferenceAt,
} from '~/util/affectedServiceRevisions';
import {
  deriveLineStartedAtFromBranches,
  sortLineBranchesForCurrentView,
} from '~/util/lineBranches';
import { recordServerTiming, timeServerSpan } from '~/util/serverTiming';
import {
  selectServiceRevisionForReferenceDate,
  serviceRevisionHasEnded,
} from '~/util/serviceRevisions';
import { type AppDb, getDefaultDb, timeDbQuery } from './database';
import { isoDate, isoDateTime, nowSg, parseDateTime } from './dateTime';
import {
  buildIssuesByLineId,
  type IssueWithOperationalEffects,
  resolveOperationalIssueIntervals,
  sumIntervalSeconds,
} from './issueIntervals';
import {
  deriveServiceScopeStationIds,
  selectLatestServiceEvents,
  selectServiceBranchSourceEvents,
} from './issueState';
import { resolveStationMembershipEndedAt } from './serviceOperations';

export type BaseIncludedEntities = Omit<IncludedEntities, 'issues'>;

type DatasetLineBranch = {
  id: CoreService['id'];
  name: CoreService['name'];
  startedAt: CoreService['revisions'][number]['startAt'] | null;
  endedAt: CoreService['revisions'][number]['endAt'];
  stationIds: Array<
    CoreService['revisions'][number]['path']['stations'][number]['stationId']
  >;
};

type BranchWithEntries = DatasetLineBranch & {
  entries: Array<{
    stationId: string;
    displayCode: string;
    pathIndex: number;
  }>;
};

export type BaseDataset = {
  included: BaseIncludedEntities;
  branchesByLineId: Record<string, BranchWithEntries[]>;
  branchByServiceId: Record<string, BranchWithEntries>;
  metadata: Record<string, string>;
  publicHolidaySet: Set<string>;
  allIssues: Record<string, IssueWithOperationalEffects>;
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>;
};

export type CompleteDatasetCaller =
  | 'route:/issues/:issueId'
  | 'route:/lines'
  | 'route:/lines/:lineId'
  | 'route:/operators/:operatorId'
  | 'route:/stations'
  | 'route:/stations/:stationId'
  | 'route:/towns'
  | 'route:/towns/:townId'
  | 'route:/sitemap.xml'
  | 'route:/statistics'
  | 'workflow:operational-facts';

export type DatasetStaticScope = {
  lineIds: readonly string[];
  serviceIds: readonly string[];
  stationIds: readonly string[];
};

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

export async function buildDataset(
  referenceNow = nowSg(),
  db?: AppDb,
  issueIds?: readonly string[],
  staticScope?: DatasetStaticScope,
): Promise<BaseDataset> {
  const database =
    db ?? (await timeServerSpan('db_connect', () => getDefaultDb()));
  const selectedIssueIds =
    issueIds == null ? undefined : [...new Set(issueIds)];
  const selectedLineIds =
    staticScope == null ? undefined : [...new Set(staticScope.lineIds)];
  const selectedServiceIds =
    staticScope == null ? undefined : [...new Set(staticScope.serviceIds)];
  const selectedStationIds =
    staticScope == null ? undefined : [...new Set(staticScope.stationIds)];

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
      staticScope == null
        ? timeDbQuery('dataset_q_metadata', () =>
            database.select().from(metadataTable),
          )
        : [],
      selectedLineIds == null
        ? timeDbQuery('dataset_q_lines', () =>
            database.select().from(linesTable),
          )
        : selectedLineIds.length > 0
          ? timeDbQuery('dataset_q_lines', () =>
              database
                .select()
                .from(linesTable)
                .where(inArray(linesTable.id, selectedLineIds)),
            )
          : [],
      selectedLineIds == null
        ? timeDbQuery('dataset_q_line_operators', () =>
            database.select().from(lineOperatorsTable),
          )
        : selectedLineIds.length > 0
          ? timeDbQuery('dataset_q_line_operators', () =>
              database
                .select()
                .from(lineOperatorsTable)
                .where(inArray(lineOperatorsTable.line_id, selectedLineIds)),
            )
          : [],
      staticScope == null
        ? timeDbQuery('dataset_q_operators', () =>
            database.select().from(operatorsTable),
          )
        : [],
      staticScope == null
        ? timeDbQuery('dataset_q_towns', () =>
            database.select().from(townsTable),
          )
        : [],
      staticScope == null
        ? timeDbQuery('dataset_q_landmarks', () =>
            database.select().from(landmarksTable),
          )
        : [],
      selectedStationIds == null
        ? timeDbQuery('dataset_q_stations', () =>
            database
              .select({
                id: stationsTable.id,
                name: stationsTable.name,
                townId: stationsTable.townId,
                latitude: sql<number>`ST_Y(${stationsTable.geo})`,
                longitude: sql<number>`ST_X(${stationsTable.geo})`,
              })
              .from(stationsTable),
          )
        : selectedStationIds.length > 0
          ? timeDbQuery('dataset_q_stations', () =>
              database
                .select({
                  id: stationsTable.id,
                  name: stationsTable.name,
                  townId: stationsTable.townId,
                  latitude: sql<number>`ST_Y(${stationsTable.geo})`,
                  longitude: sql<number>`ST_X(${stationsTable.geo})`,
                })
                .from(stationsTable)
                .where(inArray(stationsTable.id, selectedStationIds)),
            )
          : [],
      selectedStationIds == null
        ? timeDbQuery('dataset_q_station_codes', () =>
            database.select().from(stationCodesTable),
          )
        : selectedStationIds.length > 0
          ? timeDbQuery('dataset_q_station_codes', () =>
              database
                .select()
                .from(stationCodesTable)
                .where(
                  inArray(stationCodesTable.station_id, selectedStationIds),
                ),
            )
          : [],
      selectedStationIds == null
        ? timeDbQuery('dataset_q_station_landmarks', () =>
            database.select().from(stationLandmarksTable),
          )
        : selectedStationIds.length > 0
          ? timeDbQuery('dataset_q_station_landmarks', () =>
              database
                .select()
                .from(stationLandmarksTable)
                .where(
                  inArray(stationLandmarksTable.station_id, selectedStationIds),
                ),
            )
          : [],
      selectedServiceIds == null
        ? timeDbQuery('dataset_q_services', () =>
            database.select().from(servicesTable),
          )
        : selectedServiceIds.length > 0
          ? timeDbQuery('dataset_q_services', () =>
              database
                .select()
                .from(servicesTable)
                .where(inArray(servicesTable.id, selectedServiceIds)),
            )
          : [],
      selectedServiceIds == null
        ? timeDbQuery('dataset_q_service_revisions', () =>
            database.select().from(serviceRevisionsTable),
          )
        : selectedServiceIds.length > 0
          ? timeDbQuery('dataset_q_service_revisions', () =>
              database
                .select()
                .from(serviceRevisionsTable)
                .where(
                  inArray(serviceRevisionsTable.service_id, selectedServiceIds),
                ),
            )
          : [],
      staticScope == null
        ? timeDbQuery('dataset_q_public_holidays', () =>
            database.select().from(publicHolidaysTable),
          )
        : [],
      selectedIssueIds == null
        ? timeDbQuery('dataset_q_issues', () =>
            database.select().from(issuesTable),
          )
        : selectedIssueIds.length > 0
          ? timeDbQuery('dataset_q_issues', () =>
              database
                .select()
                .from(issuesTable)
                .where(inArray(issuesTable.id, selectedIssueIds)),
            )
          : [],
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
        : selectedIssueIds.length > 0
          ? timeDbQuery('dataset_q_latest_evidence', () =>
              database
                .select({
                  issue_id: evidencesTable.issue_id,
                  latest_ts: sql<string>`max(${evidencesTable.ts})`,
                })
                .from(evidencesTable)
                .where(inArray(evidencesTable.issue_id, selectedIssueIds))
                .groupBy(evidencesTable.issue_id),
            )
          : [],
      selectedIssueIds == null
        ? timeDbQuery('dataset_q_impact_events', () =>
            database.select().from(impactEventsTable),
          )
        : selectedIssueIds.length > 0
          ? timeDbQuery('dataset_q_impact_events', () =>
              database
                .select()
                .from(impactEventsTable)
                .where(inArray(impactEventsTable.issue_id, selectedIssueIds)),
            )
          : [],
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
  const serviceScopeEventIds = impactEventRows
    .filter((event) => event.type === 'service_scopes.set')
    .map((event) => event.id);
  const serviceEntityEventIds = [
    ...new Set([...selectedStateEventIds, ...serviceScopeEventIds]),
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
      periodImpactEventIds.length > 0
        ? timeDbQuery('dataset_q_impact_event_periods', () =>
            database
              .select()
              .from(impactEventPeriodsTable)
              .where(
                inArray(
                  impactEventPeriodsTable.impact_event_id,
                  periodImpactEventIds,
                ),
              ),
          )
        : ([] as (typeof impactEventPeriodsTable.$inferSelect)[]),
      serviceEntityEventIds.length > 0
        ? timeDbQuery('dataset_q_impact_event_services', () =>
            database
              .select()
              .from(impactEventEntityServicesTable)
              .where(
                inArray(
                  impactEventEntityServicesTable.impact_event_id,
                  serviceEntityEventIds,
                ),
              ),
          )
        : ([] as (typeof impactEventEntityServicesTable.$inferSelect)[]),
      selectedStateEventIds.length > 0
        ? timeDbQuery('dataset_q_impact_event_facilities', () =>
            database
              .select()
              .from(impactEventEntityFacilitiesTable)
              .where(
                inArray(
                  impactEventEntityFacilitiesTable.impact_event_id,
                  selectedStateEventIds,
                ),
              ),
          )
        : ([] as (typeof impactEventEntityFacilitiesTable.$inferSelect)[]),
      selectedStateEventIds.length > 0
        ? timeDbQuery('dataset_q_impact_event_causes', () =>
            database
              .select()
              .from(impactEventCausesTable)
              .where(
                inArray(
                  impactEventCausesTable.impact_event_id,
                  selectedStateEventIds,
                ),
              ),
          )
        : ([] as (typeof impactEventCausesTable.$inferSelect)[]),
      serviceScopeEventIds.length > 0
        ? timeDbQuery('dataset_q_impact_event_service_scopes', () =>
            database
              .select()
              .from(impactEventServiceScopesTable)
              .where(
                inArray(
                  impactEventServiceScopesTable.impact_event_id,
                  serviceScopeEventIds,
                ),
              ),
          )
        : ([] as (typeof impactEventServiceScopesTable.$inferSelect)[]),
      selectedStateEventIds.length > 0
        ? timeDbQuery('dataset_q_impact_event_service_effects', () =>
            database
              .select()
              .from(impactEventServiceEffectsTable)
              .where(
                inArray(
                  impactEventServiceEffectsTable.impact_event_id,
                  selectedStateEventIds,
                ),
              ),
          )
        : ([] as (typeof impactEventServiceEffectsTable.$inferSelect)[]),
      selectedStateEventIds.length > 0
        ? timeDbQuery('dataset_q_impact_event_facility_effects', () =>
            database
              .select()
              .from(impactEventFacilityEffectsTable)
              .where(
                inArray(
                  impactEventFacilityEffectsTable.impact_event_id,
                  selectedStateEventIds,
                ),
              ),
          )
        : ([] as (typeof impactEventFacilityEffectsTable.$inferSelect)[]),
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
    Record<string, Array<typeof serviceRevisionsTable.$inferSelect>>
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
      allRevisionIds.length > 0
        ? database
            .select()
            .from(serviceRevisionPathStationEntriesTable)
            .where(
              inArray(
                serviceRevisionPathStationEntriesTable.service_revision_id,
                allRevisionIds,
              ),
            )
        : Promise.resolve([]),
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

  const affectedServiceRevisionsByServiceId = Object.fromEntries(
    serviceRows.map((service) => {
      const revisions = (revisionsByServiceId[service.id] ?? []).flatMap(
        (revision): AffectedServiceRevision[] => {
          const revisionKey = `${revision.id}::${service.id}`;
          const entries = [...(pathEntriesByRevisionKey[revisionKey] ?? [])]
            .sort((a, b) => a.path_index - b.path_index)
            .map((entry) => entry.station_id);
          if (entries.length === 0) {
            return [];
          }

          return [
            {
              id: revision.id,
              startAt: revision.start_at,
              endAt: revision.end_at,
              updatedAt:
                revision.updated_at instanceof Date
                  ? revision.updated_at.toISOString()
                  : revision.updated_at,
              stationIds: [...new Set(entries)],
            },
          ];
        },
      );
      return [service.id, revisions] as const;
    }),
  );

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
          endedAtByStationCode <= referenceDate
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
    const sortedBranches = sortLineBranchesForCurrentView(
      branches,
      referenceDate,
    );
    branchesByLineId[lineId] = sortedBranches;
    const line = linesById[lineId];
    if (line != null) {
      line.startedAt = deriveLineStartedAtFromBranches(
        line.startedAt,
        sortedBranches,
        referenceDate,
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
          endedAt: resolveStationMembershipEndedAt(
            codeInfo?.ended_at ?? null,
            referenceDate,
          ),
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
      endedAt: resolveStationMembershipEndedAt(code.ended_at, referenceDate),
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

  const impactEventsByIssueId = impactEventRows.reduce<
    Record<string, Array<typeof impactEventsTable.$inferSelect>>
  >((acc, event) => {
    if (acc[event.issue_id] == null) {
      acc[event.issue_id] = [];
    }
    acc[event.issue_id].push(event);
    return acc;
  }, {});
  const impactEventById = new Map(
    impactEventRows.map((event) => [event.id, event]),
  );
  const serviceRowsByIssueId = impactEventServiceRows.reduce<
    Record<string, Array<typeof impactEventEntityServicesTable.$inferSelect>>
  >((acc, serviceReference) => {
    const event = impactEventById.get(serviceReference.impact_event_id);
    if (event == null) {
      return acc;
    }
    if (acc[event.issue_id] == null) {
      acc[event.issue_id] = [];
    }
    acc[event.issue_id].push(serviceReference);
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
    const serviceScopeEventByServiceId = new Map<
      string,
      (typeof impactEventRows)[number]
    >();

    const periodEvents =
      latestEventByType['periods.set'] != null
        ? [latestEventByType['periods.set']]
        : [];
    const canonicalPeriods = periodEvents.flatMap((event) => {
      return periodsByImpactEventId[event.id] ?? [];
    });
    const latestEvidenceAt = latestEvidenceAtByIssueId[row.id];
    const intervals = resolveOperationalIssueIntervals(
      canonicalPeriods.map((period) => ({
        start_at: period.start_at,
        end_at: period.end_at,
      })),
      row.type === 'infra' ? null : latestEvidenceAt,
      referenceNow,
    );

    const serviceScopeEvents = selectLatestServiceEvents(
      impactEventsByIssueId[row.id] ?? [],
      serviceRowsByIssueId[row.id] ?? [],
      row.id,
      'service_scopes.set',
    );
    for (const serviceScopeEvent of serviceScopeEvents) {
      const scopeRows =
        serviceScopesByImpactEventId[serviceScopeEvent.id] ?? [];
      for (const serviceRef of serviceRowsByImpactEventId[
        serviceScopeEvent.id
      ] ?? []) {
        serviceScopeRowsByServiceId.set(serviceRef.service_id, scopeRows);
        serviceScopeEventByServiceId.set(
          serviceRef.service_id,
          serviceScopeEvent,
        );
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

    const serviceBranchSourceEvents =
      serviceScopeEvents.length > 0
        ? serviceScopeEvents
        : selectServiceBranchSourceEvents(selectedStateEvents);
    for (const event of serviceBranchSourceEvents) {
      for (const serviceRef of serviceRowsByImpactEventId[event.id] ?? []) {
        const branch = branchByServiceId[serviceRef.service_id];
        const service = serviceById[serviceRef.service_id];
        if (branch == null || service == null) {
          continue;
        }
        const scopeRows =
          serviceScopeRowsByServiceId.get(serviceRef.service_id) ?? [];
        const wholeServiceRevisions = scopeRows.some(
          (scope) => scope.type === 'service.whole',
        )
          ? affectedServiceRevisionsByServiceId[serviceRef.service_id]
          : undefined;
        const issueReferenceAt =
          intervals[0]?.startAt ??
          serviceScopeEventByServiceId.get(serviceRef.service_id)?.ts ??
          isoDateTime(referenceNow);
        const referenceRevision =
          wholeServiceRevisions != null
            ? selectAffectedServiceRevisionForReferenceAt(
                wholeServiceRevisions,
                issueReferenceAt,
              )
            : undefined;
        serviceBranches.set(branch.id, {
          lineId: service.line_id,
          branchId: branch.id,
          serviceName: branch.name,
          stationIds: deriveServiceScopeStationIds(
            branch.stationIds,
            scopeRows,
            referenceRevision?.stationIds,
          ),
          wholeServiceRevisions,
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

/**
 * Builds the entire network and issue graph. This is intentionally reserved
 * for bounded maintenance and recovery work; public request readers should
 * use a scoped read model instead.
 */
export async function buildCompleteDataset(
  caller: CompleteDatasetCaller,
  referenceNow = nowSg(),
  db?: AppDb,
): Promise<BaseDataset> {
  console.info(
    JSON.stringify({
      event: 'complete_dataset_read',
      caller,
    }),
  );
  return timeServerSpan('build_dataset', () => buildDataset(referenceNow, db));
}

export async function getCompleteDataset(caller: CompleteDatasetCaller) {
  return buildCompleteDataset(caller);
}
