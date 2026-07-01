import type {
  FacilityEffectKind,
  IssueType,
  Service as CoreService,
  ServiceEffectKind,
} from '@mrtdown/core';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import { runDbOrderedStatements } from '~/db/orderedStatements';
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
  issueDayFactsTable,
  issuesTable,
  landmarksTable,
  lineDayFactsTable,
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
  statisticsSnapshotsTable,
  townsTable,
} from '~/db/schema';
import type {
  IncludedEntities,
  Issue,
  IssueAffectedBranch,
  Line,
  LineSummary,
  LineSummaryStatus,
  Station,
} from '~/types';
import { getPublicCrowdReportSignals } from '~/util/crowdReports';
import {
  issueContributesToLineDowntime,
  issueContributesToLineStatus,
} from '~/util/issueOperationalEffects';
import {
  deriveLineStartedAtFromBranches,
  sortLineBranchesForCurrentView,
} from '~/util/lineBranches';
import {
  recordServerTiming,
  timeServerSpan,
  timeSyncServerSpan,
} from '~/util/serverTiming';
import {
  selectServiceRevisionForReferenceDate,
  serviceRevisionHasEnded,
} from '~/util/serviceRevisions';
import { selectIncludedEntities } from './included';
import {
  chunk,
  getDefaultDb,
  isMissingTableError,
  publicMetadataKeySql,
  selectByIdChunks,
  timeDbQuery,
} from './shared';
import {
  deriveServiceScopeStationIds,
  selectServiceBranchSourceEvents,
} from './serviceScopes';
import {
  hasFullDateCoverage,
  selectLegacyHistoryFallback,
} from './historyFallback';
import {
  clipIntervalToRange,
  clipIssueIntervalsToRange,
  getIssueBounds,
  issueActiveNow,
  issueActiveToday,
  issueOverlapsRange,
  issueTouchesDate,
  resolveOperationalIssueIntervals,
  sortIssuesByLatestActivity,
  sumIntervalSeconds,
  type IssueIntervalBounds,
} from './issueIntervals';
import {
  isLineFuture,
  isLineOperatingNow,
  lineDayType,
  serviceWindowForDate,
} from './lineService';
import {
  addIssueTypeCount,
  createIssueTypeBreakdown,
  createIssueTypeCounts,
  createIssueTypeIntervalGroups,
  groupIssueFactCountsByDate,
  ISSUE_TYPES,
  pickIssueDurationByType,
  pickIssueTypes,
  sumIssueTypeIntervalGroups,
  type IssueTypeBreakdown,
  type IssueTypeCounts,
} from './issueTypeStats';
import { parseStatisticsSnapshotPayload } from './statisticsPayload';
import {
  getIssueDayFactsInRange,
  getOperationalFactCoverageDatesInRange,
  getOperationalFactCoverageStart,
} from './operationalFacts';
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
import type { StatisticsSnapshotPayload, SystemAnalytics } from './types';

type BaseIncludedEntities = Omit<IncludedEntities, 'issues'>;

type DatasetLineBranch = {
  id: CoreService['id'];
  name: CoreService['name'];
  startedAt: CoreService['revisions'][number]['startAt'] | null;
  endedAt: CoreService['revisions'][number]['endAt'];
  stationIds: Array<
    CoreService['revisions'][number]['path']['stations'][number]['stationId']
  >;
};

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

type IssueWithOperationalEffects = Issue & {
  serviceEffectKinds: ServiceEffectKind[];
  facilityEffectKinds: FacilityEffectKind[];
};

type BranchWithEntries = DatasetLineBranch & {
  entries: Array<{
    stationId: string;
    displayCode: string;
    pathIndex: number;
  }>;
};

type CommunitySignalOptions = {
  includeCommunitySignals?: boolean;
};

type BaseDataset = {
  included: BaseIncludedEntities;
  branchesByLineId: Record<string, BranchWithEntries[]>;
  branchByServiceId: Record<string, BranchWithEntries>;
  metadata: Record<string, string>;
  publicHolidaySet: Set<string>;
  allIssues: Record<string, IssueWithOperationalEffects>;
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>;
};

type OverviewDataset = Pick<
  BaseDataset,
  'included' | 'publicHolidaySet' | 'allIssues' | 'issuesByLineId'
>;

const BASE_DATASET_CACHE_TTL_MS = 5 * 60_000;
const OPERATIONAL_FACTS_REBUILD_DAY_BATCH = 30;
const OPERATIONAL_FACTS_WRITE_BATCH = 10;
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

type OperationalFactsRebuildContext = {
  issues: IssueWithOperationalEffects[];
  lines: Line[];
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>;
};

type OperationalFactRowsForDate = {
  date: string;
  issueRows: (typeof issueDayFactsTable.$inferInsert)[];
  lineRows: (typeof lineDayFactsTable.$inferInsert)[];
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

async function buildDataset(
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

async function buildBaseDataset(
  referenceNow = nowSg(),
  db?: AppDb,
): Promise<BaseDataset> {
  return timeServerSpan('build_dataset', () => buildDataset(referenceNow, db));
}

async function getBaseDataset() {
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

async function getOverviewDataset(days: number) {
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

async function getIncludedForIssueIds(issueIds: readonly string[]) {
  const dataset = await buildDataset(nowSg(), undefined, issueIds);
  return selectIncludedEntities(dataset.included, dataset.allIssues, {
    issueIds,
    includeStationMembershipLines: true,
  });
}

export function buildLineSummary(
  line: Line,
  issues: IssueWithOperationalEffects[],
  days: number,
  publicHolidaySet: Set<string>,
  referenceNow = nowSg(),
): LineSummary {
  const startDate = referenceNow.startOf('day').minus({ days: days - 1 });
  const breakdownByDates: LineSummary['breakdownByDates'] = {};
  const downtimeIntervalsByIssueType = createIssueTypeIntervalGroups();

  let totalServiceSeconds = 0;
  let totalDowntimeSeconds = 0;

  for (let offset = 0; offset < days; offset++) {
    const date = startDate.plus({ days: offset });
    const dayWindow = serviceWindowForDate(line, date, publicHolidaySet);
    const dayBreakdown: LineSummary['breakdownByDates'][string] = {
      breakdownByIssueTypes: {},
      dayType: lineDayType(date, publicHolidaySet),
    };

    if (!isLineFuture(line, date.endOf('day'))) {
      totalServiceSeconds += dayWindow.seconds;
    }

    const dailyDowntimeIntervals: IssueIntervalBounds[] = [];
    const dailyIntervalsByIssueType = createIssueTypeIntervalGroups();

    for (const issue of issues) {
      const contributingBounds = clipIssueIntervalsToRange(
        issue,
        dayWindow.start,
        dayWindow.end,
        referenceNow,
      );
      const dayOverlap = sumIntervalSeconds(contributingBounds, referenceNow);

      if (dayOverlap <= 0) {
        continue;
      }

      dailyIntervalsByIssueType[issue.type].push(...contributingBounds);

      if (issueContributesToLineDowntime(issue)) {
        dailyDowntimeIntervals.push(...contributingBounds);
        downtimeIntervalsByIssueType[issue.type].push(...contributingBounds);
      }

      const current = dayBreakdown.breakdownByIssueTypes[issue.type] ?? {
        totalDurationSeconds: 0,
        issueIds: [],
      };
      if (!current.issueIds.includes(issue.id)) {
        current.issueIds.push(issue.id);
      }
      dayBreakdown.breakdownByIssueTypes[issue.type] = current;
    }

    const dailyDurationSecondsByIssueType = sumIssueTypeIntervalGroups(
      dailyIntervalsByIssueType,
      referenceNow,
    );
    for (const issueType of ISSUE_TYPES) {
      const current = dayBreakdown.breakdownByIssueTypes[issueType];
      if (current != null) {
        current.totalDurationSeconds =
          dailyDurationSecondsByIssueType[issueType];
      }
    }

    totalDowntimeSeconds += sumIntervalSeconds(
      dailyDowntimeIntervals,
      referenceNow,
    );

    breakdownByDates[isoDate(date)] = dayBreakdown;
  }

  const activeNow = issues.filter((issue) =>
    issueActiveNow(issue, referenceNow),
  );
  let status: LineSummaryStatus = 'normal';
  if (isLineFuture(line, referenceNow)) {
    status = 'future_service';
  } else if (!isLineOperatingNow(line, publicHolidaySet, referenceNow)) {
    status = 'closed_for_day';
  } else if (
    activeNow.some(
      (issue) =>
        issue.type === 'disruption' && issueContributesToLineStatus(issue),
    )
  ) {
    status = 'ongoing_disruption';
  } else if (
    activeNow.some(
      (issue) =>
        issue.type === 'maintenance' && issueContributesToLineStatus(issue),
    )
  ) {
    status = 'ongoing_maintenance';
  } else if (
    activeNow.some(
      (issue) => issue.type === 'infra' && issueContributesToLineStatus(issue),
    )
  ) {
    status = 'ongoing_infra';
  }

  const durationSecondsByIssueType = sumIssueTypeIntervalGroups(
    downtimeIntervalsByIssueType,
    referenceNow,
  );

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
    totalDowntimeSeconds: totalServiceSeconds > 0 ? totalDowntimeSeconds : null,
    downtimeBreakdown:
      totalServiceSeconds > 0
        ? (['disruption', 'maintenance', 'infra'] as IssueType[]).map(
            (type) => ({
              type,
              downtimeSeconds: durationSecondsByIssueType[type] ?? 0,
            }),
          )
        : null,
    uptimeRank: null,
    totalLines: null,
  };
}

function rankLineSummaries(lineSummaries: LineSummary[]) {
  const ranked = lineSummaries
    .filter((summary) => summary.uptimeRatio != null)
    .sort((a, b) => (b.uptimeRatio ?? 0) - (a.uptimeRatio ?? 0));

  return lineSummaries.map((summary) => {
    const rank = ranked.findIndex((item) => item.lineId === summary.lineId);
    return {
      ...summary,
      uptimeRank: summary.uptimeRatio != null ? rank + 1 : null,
      totalLines: ranked.length > 0 ? ranked.length : null,
    };
  });
}

function buildIssuesByLineId(issues: Iterable<IssueWithOperationalEffects>) {
  const issuesByLineId: Record<string, IssueWithOperationalEffects[]> = {};

  for (const issue of issues) {
    for (const lineId of new Set(issue.lineIds)) {
      const lineIssues = issuesByLineId[lineId] ?? [];
      lineIssues.push(issue);
      issuesByLineId[lineId] = lineIssues;
    }
  }

  return issuesByLineId;
}

function buildOperationalFactsRebuildContext(
  dataset: BaseDataset,
): OperationalFactsRebuildContext {
  const issues = Object.values(dataset.allIssues);

  return {
    issues,
    lines: Object.values(dataset.included.lines),
    issuesByLineId: dataset.issuesByLineId,
  };
}

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

function buildLineOperationalFactRow(
  line: Line,
  lineIssues: IssueWithOperationalEffects[],
  normalizedDate: DateTime,
  publicHolidaySet: Set<string>,
  asOf: DateTime,
): typeof lineDayFactsTable.$inferInsert {
  const issueCounts = createIssueTypeCounts();
  const downtimeIntervalsByIssueType = createIssueTypeIntervalGroups();
  const lineFuture = isLineFuture(line, normalizedDate.endOf('day'));
  const serviceWindow = serviceWindowForDate(
    line,
    normalizedDate,
    publicHolidaySet,
  );

  for (const issue of lineIssues) {
    if (issueTouchesDate(issue, normalizedDate)) {
      addIssueTypeCount(issueCounts, issue.type, 1);
    }

    if (lineFuture || !issueContributesToLineDowntime(issue)) {
      continue;
    }

    downtimeIntervalsByIssueType[issue.type].push(
      ...clipIssueIntervalsToRange(
        issue,
        serviceWindow.start,
        serviceWindow.end,
        asOf,
      ),
    );
  }

  const downtimeSeconds = sumIssueTypeIntervalGroups(
    downtimeIntervalsByIssueType,
    asOf,
  );

  return {
    date: isoDate(normalizedDate),
    line_id: line.id,
    as_of: isoDateTime(asOf),
    service_seconds: Math.round(lineFuture ? 0 : serviceWindow.seconds),
    downtime_disruption_seconds: Math.round(downtimeSeconds.disruption),
    downtime_maintenance_seconds: Math.round(downtimeSeconds.maintenance),
    downtime_infra_seconds: Math.round(downtimeSeconds.infra),
    issue_count_disruption: issueCounts.disruption,
    issue_count_maintenance: issueCounts.maintenance,
    issue_count_infra: issueCounts.infra,
  };
}

function buildOperationalFactRowsForDate(
  date: DateTime,
  dataset: BaseDataset,
  context: OperationalFactsRebuildContext,
): OperationalFactRowsForDate {
  const normalizedDate = date.setZone(SG_TIMEZONE).startOf('day');
  const asOf = normalizedDate.endOf('day');
  const dateKey = isoDate(normalizedDate);
  const dayEnd = normalizedDate.plus({ days: 1 });

  const issueRows = context.issues
    .map((issue) => {
      const intervals = getIssueBounds(issue)
        .map((interval) =>
          clipIntervalToRange(
            interval.start,
            interval.end,
            normalizedDate,
            dayEnd,
            asOf,
          ),
        )
        .filter((interval) => interval != null);
      const durationSeconds = sumIntervalSeconds(intervals, asOf);

      return {
        date: dateKey,
        issue_id: issue.id,
        issue_type: issue.type,
        as_of: isoDateTime(asOf),
        active_anytime: durationSeconds > 0,
        active_end_of_day: issueActiveNow(issue, asOf),
        duration_seconds: Math.round(durationSeconds),
        inferred_interval_count: 0,
      };
    })
    .filter((row) => row.active_anytime || row.active_end_of_day);

  const lineRows = context.lines.map((line) =>
    buildLineOperationalFactRow(
      line,
      context.issuesByLineId[line.id] ?? [],
      normalizedDate,
      dataset.publicHolidaySet,
      asOf,
    ),
  );

  return {
    date: dateKey,
    issueRows,
    lineRows,
  };
}

async function replaceOperationalFactRows(
  database: AppDb,
  rowsByDate: OperationalFactRowsForDate[],
) {
  const dates = rowsByDate.map((rows) => rows.date);
  const issueRows = rowsByDate.flatMap((rows) => rows.issueRows);
  const lineRows = rowsByDate.flatMap((rows) => rows.lineRows);

  await runDbOrderedStatements(database, async (tx) => {
    for (const batch of chunk(dates, OPERATIONAL_FACTS_REBUILD_DAY_BATCH)) {
      if (batch.length === 0) {
        continue;
      }
      await tx
        .delete(issueDayFactsTable)
        .where(inArray(issueDayFactsTable.date, batch));
      await tx
        .delete(lineDayFactsTable)
        .where(inArray(lineDayFactsTable.date, batch));
    }

    for (const batch of chunk(issueRows, OPERATIONAL_FACTS_WRITE_BATCH)) {
      if (batch.length > 0) {
        await tx.insert(issueDayFactsTable).values(batch);
      }
    }
    for (const batch of chunk(lineRows, OPERATIONAL_FACTS_WRITE_BATCH)) {
      if (batch.length > 0) {
        await tx.insert(lineDayFactsTable).values(batch);
      }
    }
  });
}

async function rebuildOperationalFactsForDateFromDataset(
  date: DateTime,
  dataset: BaseDataset,
  db?: AppDb,
  context = buildOperationalFactsRebuildContext(dataset),
) {
  const database = db ?? (await getDefaultDb());
  const rows = buildOperationalFactRowsForDate(date, dataset, context);

  await replaceOperationalFactRows(database, [rows]);

  return {
    date: rows.date,
    issueCount: rows.issueRows.length,
    lineCount: rows.lineRows.length,
  };
}

export async function rebuildOperationalFactsForDate(
  date: DateTime,
  db?: AppDb,
) {
  const normalizedDate = date.setZone(SG_TIMEZONE).startOf('day');
  const dataset = await buildBaseDataset(normalizedDate.endOf('day'), db);
  return rebuildOperationalFactsForDateFromDataset(normalizedDate, dataset, db);
}

export async function rebuildOperationalFactsForDates(
  dates: readonly string[],
  db?: AppDb,
) {
  const normalizedDates = [
    ...new Set(
      dates.map((date) => {
        const parsed = DateTime.fromISO(date, { zone: SG_TIMEZONE });
        if (!parsed.isValid) {
          throw new Error(`Invalid operational fact date: ${date}`);
        }
        return isoDate(parsed.startOf('day'));
      }),
    ),
  ].sort();
  if (normalizedDates.length === 0) {
    return [];
  }

  const dateTimes = normalizedDates.map((date) =>
    DateTime.fromISO(date, { zone: SG_TIMEZONE }),
  );
  const latestDate = dateTimes.reduce((latest, date) =>
    date > latest ? date : latest,
  );
  const dataset = await buildBaseDataset(latestDate.endOf('day'), db);
  const context = buildOperationalFactsRebuildContext(dataset);
  const database = db ?? (await getDefaultDb());
  const results: Array<{
    date: string;
    issueCount: number;
    lineCount: number;
  }> = [];

  for (const batch of chunk(dateTimes, OPERATIONAL_FACTS_REBUILD_DAY_BATCH)) {
    const rowsByDate = batch.map((date) =>
      buildOperationalFactRowsForDate(date, dataset, context),
    );
    await replaceOperationalFactRows(database, rowsByDate);
    results.push(
      ...rowsByDate.map((rows) => ({
        date: rows.date,
        issueCount: rows.issueRows.length,
        lineCount: rows.lineRows.length,
      })),
    );
  }

  return results;
}

export async function rebuildOperationalFactsRange(
  days: number,
  end = nowSg(),
  db?: AppDb,
) {
  const normalizedEnd = end.setZone(SG_TIMEZONE).startOf('day');
  const dataset = await buildBaseDataset(normalizedEnd.endOf('day'), db);
  const context = buildOperationalFactsRebuildContext(dataset);
  const database = db ?? (await getDefaultDb());
  const results: Array<{
    date: string;
    issueCount: number;
    lineCount: number;
  }> = [];

  const dates = Array.from({ length: days }, (_, index) =>
    normalizedEnd.minus({ days: days - 1 - index }),
  );
  for (const batch of chunk(dates, OPERATIONAL_FACTS_REBUILD_DAY_BATCH)) {
    const rowsByDate = batch.map((date) =>
      buildOperationalFactRowsForDate(date, dataset, context),
    );
    await replaceOperationalFactRows(database, rowsByDate);
    results.push(
      ...rowsByDate.map((rows) => ({
        date: rows.date,
        issueCount: rows.issueRows.length,
        lineCount: rows.lineRows.length,
      })),
    );
  }
  return results;
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

const STATISTICS_SNAPSHOT_ID = 'latest';

async function getLatestStatisticsSnapshot(db?: AppDb) {
  const database = db ?? (await getDefaultDb());
  try {
    const [snapshot] = await timeServerSpan('statistics_snapshot_query', () =>
      database
        .select({
          data: statisticsSnapshotsTable.data,
        })
        .from(statisticsSnapshotsTable)
        .where(eq(statisticsSnapshotsTable.id, STATISTICS_SNAPSHOT_ID))
        .limit(1),
    );
    return parseStatisticsSnapshotPayload(snapshot?.data);
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
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
