import { asc, eq, inArray, or } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventServiceScopesTable,
  impactEventsTable,
  landmarksTable,
  lineOperatorsTable,
  linesTable,
  serviceRevisionPathStationEntriesTable,
  stationCodesTable,
  stationLandmarksTable,
  stationsTable,
  townsTable,
} from '~/db/schema';
import type { Line } from '~/types';
import { getPublicCrowdReportSignals } from '~/util/crowdReports';
import { timeServerSpan } from '~/util/serverTiming';
import { selectIncludedEntities } from './included';
import { buildStationIncluded, getScopedIssueHydrationFromDb } from './issues';
import { issueActiveNow, sortIssuesByLatestActivity } from './issueIntervals';
import { pickIssueTypes } from './issueTypeStats';
import { getDefaultDb, selectByIdChunks, timeDbQuery } from './shared';
import { isoDate, nowSg } from './temporal';
import type {
  BaseIncludedEntities,
  CommunitySignalOptions,
  IssueWithOperationalEffects,
} from './types';

type NamedEntity = {
  id: string;
  name: Line['name'];
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

function buildNamedEntities<T extends { id: string; name: unknown }>(
  rows: T[],
) {
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: parseTranslations(row.name),
      } satisfies NamedEntity,
    ]),
  );
}

function buildLines(
  lineRows: Array<
    Pick<
      typeof linesTable.$inferSelect,
      'id' | 'name' | 'type' | 'color' | 'started_at' | 'operating_hours'
    >
  >,
  lineOperatorRows: Array<
    Pick<
      typeof lineOperatorsTable.$inferSelect,
      'line_id' | 'operator_id' | 'started_at' | 'ended_at'
    >
  >,
) {
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

async function getStationBaseIncludedFromDb(
  db: AppDb,
  stationId: string,
  referenceNow: DateTime,
) {
  const stationRows = await timeDbQuery('station_q_station', () =>
    db
      .select({
        id: stationsTable.id,
        name: stationsTable.name,
        townId: stationsTable.townId,
        latitude: stationsTable.latitude,
        longitude: stationsTable.longitude,
      })
      .from(stationsTable)
      .where(eq(stationsTable.id, stationId)),
  );
  const stationRow = stationRows[0];
  if (stationRow == null) {
    throw new Response('Station not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const [stationCodeRows, stationLandmarkRows, townRows] = await Promise.all([
    timeDbQuery('station_q_station_codes', () =>
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
        .where(eq(stationCodesTable.station_id, stationId))
        .orderBy(asc(stationCodesTable.line_id), asc(stationCodesTable.code)),
    ),
    timeDbQuery('station_q_station_landmarks', () =>
      db
        .select({
          station_id: stationLandmarksTable.station_id,
          landmark_id: stationLandmarksTable.landmark_id,
        })
        .from(stationLandmarksTable)
        .where(eq(stationLandmarksTable.station_id, stationId)),
    ),
    timeDbQuery('station_q_town', () =>
      db
        .select({
          id: townsTable.id,
          name: townsTable.name,
        })
        .from(townsTable)
        .where(eq(townsTable.id, stationRow.townId)),
    ),
  ]);
  const lineIds = [...new Set(stationCodeRows.map((row) => row.line_id))];
  const landmarkIds = [
    ...new Set(stationLandmarkRows.map((row) => row.landmark_id)),
  ];
  const [lineRows, lineOperatorRows, landmarkRows] = await Promise.all([
    timeDbQuery('station_q_lines', () =>
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
    timeDbQuery('station_q_line_operators', () =>
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
    timeDbQuery('station_q_landmarks', () =>
      selectByIdChunks(landmarkIds, (ids) =>
        db
          .select({
            id: landmarksTable.id,
            name: landmarksTable.name,
          })
          .from(landmarksTable)
          .where(inArray(landmarksTable.id, ids)),
      ),
    ),
  ]);

  return {
    included: {
      lines: buildLines(lineRows, lineOperatorRows),
      stations: buildStationIncluded(
        stationRows,
        stationCodeRows,
        isoDate(referenceNow),
        stationLandmarkRows,
      ),
      operators: {},
      towns: buildNamedEntities(townRows),
      landmarks: buildNamedEntities(landmarkRows),
    } satisfies BaseIncludedEntities,
    lineIds,
  };
}

async function getCandidateIssueIdsForStationFromDb(
  db: AppDb,
  stationId: string,
) {
  const [facilityEventRows, scopeEventRows, servicePathRows] =
    await Promise.all([
      timeDbQuery('station_q_facility_issue_events', () =>
        db
          .select({
            impact_event_id: impactEventEntityFacilitiesTable.impact_event_id,
          })
          .from(impactEventEntityFacilitiesTable)
          .where(eq(impactEventEntityFacilitiesTable.station_id, stationId)),
      ),
      timeDbQuery('station_q_scope_issue_events', () =>
        db
          .select({
            impact_event_id: impactEventServiceScopesTable.impact_event_id,
          })
          .from(impactEventServiceScopesTable)
          .where(
            or(
              eq(impactEventServiceScopesTable.station_id, stationId),
              eq(impactEventServiceScopesTable.from_station_id, stationId),
              eq(impactEventServiceScopesTable.to_station_id, stationId),
            ),
          ),
      ),
      timeDbQuery('station_q_service_path_services', () =>
        db
          .select({
            service_id: serviceRevisionPathStationEntriesTable.service_id,
          })
          .from(serviceRevisionPathStationEntriesTable)
          .where(
            eq(serviceRevisionPathStationEntriesTable.station_id, stationId),
          ),
      ),
    ]);
  const serviceIds = [...new Set(servicePathRows.map((row) => row.service_id))];
  const serviceEventRows = await timeDbQuery(
    'station_q_service_issue_events',
    () =>
      selectByIdChunks(serviceIds, (ids) =>
        db
          .select({
            impact_event_id: impactEventEntityServicesTable.impact_event_id,
          })
          .from(impactEventEntityServicesTable)
          .where(inArray(impactEventEntityServicesTable.service_id, ids)),
      ),
  );
  const eventIds = [
    ...new Set(
      [...facilityEventRows, ...scopeEventRows, ...serviceEventRows].map(
        (row) => row.impact_event_id,
      ),
    ),
  ];
  const issueRows = await timeDbQuery('station_q_issue_ids', () =>
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

function mergeBaseIncluded(
  stationIncluded: BaseIncludedEntities,
  issueIncluded: BaseIncludedEntities,
) {
  return {
    lines: {
      ...stationIncluded.lines,
      ...issueIncluded.lines,
    },
    stations: {
      ...issueIncluded.stations,
      ...stationIncluded.stations,
    },
    operators: {
      ...issueIncluded.operators,
      ...stationIncluded.operators,
    },
    towns: {
      ...issueIncluded.towns,
      ...stationIncluded.towns,
    },
    landmarks: {
      ...issueIncluded.landmarks,
      ...stationIncluded.landmarks,
    },
  } satisfies BaseIncludedEntities;
}

function issuesAffectingStation(
  allIssues: Record<string, IssueWithOperationalEffects>,
  stationId: string,
) {
  return Object.values(allIssues).filter((issue) =>
    issue.branchesAffected.some((branch) =>
      branch.stationIds.includes(stationId),
    ),
  );
}

export async function getStationProfileData(
  stationId: string,
  options: CommunitySignalOptions = {},
) {
  const db = await getDefaultDb();
  return getStationProfileDataFromDb(db, stationId, options);
}

export async function getStationProfileDataFromDb(
  db: AppDb,
  stationId: string,
  options: CommunitySignalOptions = {},
  referenceNow = nowSg(),
) {
  return timeServerSpan('station_profile_data', async () => {
    const stationBase = await getStationBaseIncludedFromDb(
      db,
      stationId,
      referenceNow,
    );
    const [candidateIssueIds, communitySignals] = await Promise.all([
      getCandidateIssueIdsForStationFromDb(db, stationId),
      options.includeCommunitySignals
        ? getPublicCrowdReportSignals(db, { stationId })
        : Promise.resolve([]),
    ]);
    const communitySignalStationIds = [
      ...new Set(communitySignals.flatMap((signal) => signal.stationIds)),
    ];
    const issueHydration =
      candidateIssueIds.length > 0 || communitySignalStationIds.length > 0
        ? await getScopedIssueHydrationFromDb({
            db,
            issueIds: candidateIssueIds,
            lines: stationBase.included.lines,
            referenceNow,
            spanPrefix: 'station',
            stationIds: [stationId, ...communitySignalStationIds],
          })
        : {
            allIssues: {},
            included: {
              lines: stationBase.included.lines,
              stations: {},
              operators: {},
              towns: {},
              landmarks: {},
            } satisfies BaseIncludedEntities,
          };
    const baseIncluded = mergeBaseIncluded(
      stationBase.included,
      issueHydration.included,
    );
    const stationIssues = issuesAffectingStation(
      issueHydration.allIssues,
      stationId,
    );
    const activeNow = stationIssues.filter((issue) =>
      issueActiveNow(issue, referenceNow),
    );

    let status:
      | 'normal'
      | 'ongoing_disruption'
      | 'ongoing_maintenance'
      | 'ongoing_infra' = 'normal';
    if (activeNow.some((issue) => issue.type === 'disruption')) {
      status = 'ongoing_disruption';
    } else if (activeNow.some((issue) => issue.type === 'maintenance')) {
      status = 'ongoing_maintenance';
    } else if (activeNow.some((issue) => issue.type === 'infra')) {
      status = 'ongoing_infra';
    }

    const issueIdsRecent = sortIssuesByLatestActivity(
      stationIssues.map((issue) => issue.id),
      issueHydration.allIssues,
    ).slice(0, 15);
    const selectedIncluded = selectIncludedEntities(
      baseIncluded,
      issueHydration.allIssues,
      {
        issueIds: issueIdsRecent,
        lineIds: [
          ...new Set(communitySignals.flatMap((signal) => signal.lineIds)),
        ],
        stationIds: [stationId, ...communitySignalStationIds],
        includeStationDetailEntities: true,
        includeStationMembershipLines: true,
      },
    );

    return {
      data: {
        stationId,
        status,
        issueIdsRecent,
        issueCountByType: pickIssueTypes(stationIssues),
        communitySignals,
      },
      included: selectedIncluded,
    };
  });
}
