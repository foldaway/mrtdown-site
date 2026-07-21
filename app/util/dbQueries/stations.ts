import type { LineSummaryStatus, Station } from '~/types';
import { and, asc, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  issueDayFactsTable,
  linesTable,
  servicesTable,
  stationCodesTable,
  stationIssueFactsTable,
  stationLandmarksTable,
  stationPlatformServicesTable,
  stationPlatformsTable,
  stationsTable,
  townsTable,
} from '~/db/schema';
import {
  type CommunitySignalOptions,
  getPageCommunitySignals,
} from './communitySignals';
import { getDefaultDb, timeDbQuery } from './database';
import { buildDataset, parseTranslations } from './dataset';
import { isoDate, nowSg } from './dateTime';
import { getEstimatedStationArrivalTimings } from '~/util/estimatedArrivals';
import { selectIncludedEntities } from './includedEntities';
import { pickIssueTypes } from './issueAnalytics';
import {
  type IssueWithOperationalEffects,
  issueActiveNow,
  sortIssuesByLatestActivity,
} from './issueIntervals';
import { getIssueStaticScope } from './readModelScope';

export function resolveStationProfileStationId(
  included: { stations: Record<string, Pick<Station, 'id' | 'memberships'>> },
  stationIdOrCode: string,
) {
  if (included.stations[stationIdOrCode] != null) {
    return stationIdOrCode;
  }

  const aliasMatches = Object.values(included.stations)
    .flatMap((station) =>
      station.memberships
        .filter((membership) => membership.code === stationIdOrCode)
        .map((membership) => ({
          lineId: membership.lineId,
          stationId: station.id,
        })),
    )
    .sort((a, b) => {
      const lineDiff = a.lineId.localeCompare(b.lineId);
      if (lineDiff !== 0) {
        return lineDiff;
      }
      return a.stationId.localeCompare(b.stationId);
    });

  return aliasMatches[0]?.stationId ?? null;
}

async function resolveStationProfileStationIdFromDb(stationIdOrCode: string) {
  const db = await getDefaultDb();
  const [stationRow] = await timeDbQuery('station_profile_q_root', () =>
    db
      .select({ id: stationsTable.id })
      .from(stationsTable)
      .where(eq(stationsTable.id, stationIdOrCode))
      .limit(1),
  );
  if (stationRow != null) {
    return { db, stationId: stationRow.id };
  }

  const [stationCodeRow] = await timeDbQuery(
    'station_profile_q_root_by_code',
    () =>
      db
        .select({ stationId: stationCodesTable.station_id })
        .from(stationCodesTable)
        .where(eq(stationCodesTable.code, stationIdOrCode))
        .orderBy(
          asc(stationCodesTable.line_id),
          asc(stationCodesTable.station_id),
        )
        .limit(1),
  );
  return { db, stationId: stationCodeRow?.stationId ?? null };
}

async function getStationCandidateIssueIds(
  stationId: string,
  serviceIds: readonly string[],
  db: Awaited<ReturnType<typeof getDefaultDb>>,
) {
  const [facilityIssueRows, serviceIssueRows] = await Promise.all([
    timeDbQuery('station_profile_q_facility_issues', () =>
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
        .where(eq(impactEventEntityFacilitiesTable.station_id, stationId)),
    ),
    serviceIds.length > 0
      ? timeDbQuery('station_profile_q_service_issues', () =>
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
  ]);

  return [
    ...new Set(
      [...facilityIssueRows, ...serviceIssueRows].map((row) => row.issueId),
    ),
  ];
}

export function mergeStationReadModelScope(input: {
  stationId: string;
  stationLineIds: readonly string[];
  stationServiceIds: readonly string[];
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
        ...input.stationLineIds,
        ...input.communityLineIds,
        ...input.issueScope.lineIds,
      ]),
    ],
    serviceIds: [
      ...new Set([...input.stationServiceIds, ...input.issueScope.serviceIds]),
    ],
    stationIds: [
      ...new Set([
        input.stationId,
        ...input.communityStationIds,
        ...input.issueScope.stationIds,
      ]),
    ],
  };
}

export async function getStationProfileReadModel(
  stationId: string,
  options: CommunitySignalOptions = {},
) {
  const referenceNow = nowSg();
  const { db, stationId: resolvedStationId } =
    await resolveStationProfileStationIdFromDb(stationId);
  if (resolvedStationId == null) {
    throw new Response('Station not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const stationCodeRows = await timeDbQuery(
    'station_profile_q_membership_lines',
    () =>
      db
        .select({ lineId: stationCodesTable.line_id })
        .from(stationCodesTable)
        .where(eq(stationCodesTable.station_id, resolvedStationId)),
  );
  const stationLineIds = [...new Set(stationCodeRows.map((row) => row.lineId))];
  const stationServiceRows =
    stationLineIds.length > 0
      ? await timeDbQuery('station_profile_q_line_services', () =>
          db
            .select({ id: servicesTable.id })
            .from(servicesTable)
            .where(inArray(servicesTable.line_id, stationLineIds)),
        )
      : [];
  const stationServiceIds = stationServiceRows.map((row) => row.id);
  const [candidateIssueIds, communitySignals] = await Promise.all([
    getStationCandidateIssueIds(resolvedStationId, stationServiceIds, db),
    getPageCommunitySignals(options, { stationId: resolvedStationId }),
  ]);
  const issueScope = await getIssueStaticScope(
    candidateIssueIds,
    db,
    'station_profile',
  );
  const initialScope = mergeStationReadModelScope({
    stationId: resolvedStationId,
    stationLineIds,
    stationServiceIds,
    communityLineIds: communitySignals.flatMap((signal) => signal.lineIds),
    communityStationIds: communitySignals.flatMap(
      (signal) => signal.stationIds,
    ),
    issueScope,
  });
  const [scopedStationCodeRows, scopedStationRows, stationLandmarkRows] =
    await Promise.all([
      timeDbQuery('station_profile_q_scoped_membership_lines', () =>
        db
          .select({ lineId: stationCodesTable.line_id })
          .from(stationCodesTable)
          .where(
            inArray(stationCodesTable.station_id, initialScope.stationIds),
          ),
      ),
      timeDbQuery('station_profile_q_scoped_towns', () =>
        db
          .select({ townId: stationsTable.townId })
          .from(stationsTable)
          .where(inArray(stationsTable.id, initialScope.stationIds)),
      ),
      timeDbQuery('station_profile_q_scoped_landmarks', () =>
        db
          .select({ landmarkId: stationLandmarksTable.landmark_id })
          .from(stationLandmarksTable)
          .where(
            inArray(stationLandmarksTable.station_id, initialScope.stationIds),
          ),
      ),
    ]);
  const lineIds = [
    ...new Set([
      ...initialScope.lineIds,
      ...scopedStationCodeRows.map((row) => row.lineId),
    ]),
  ];
  const scopedServiceRows =
    lineIds.length > 0
      ? await timeDbQuery('station_profile_q_scoped_services', () =>
          db
            .select({ id: servicesTable.id })
            .from(servicesTable)
            .where(inArray(servicesTable.line_id, lineIds)),
        )
      : [];
  const dataset = await buildDataset(referenceNow, db, candidateIssueIds, {
    lineIds,
    serviceIds: [
      ...new Set([
        ...initialScope.serviceIds,
        ...scopedServiceRows.map((row) => row.id),
      ]),
    ],
    stationIds: initialScope.stationIds,
    townIds: [...new Set(scopedStationRows.map((row) => row.townId))],
    landmarkIds: [...new Set(stationLandmarkRows.map((row) => row.landmarkId))],
    includePublicHolidays: true,
  });
  const station = dataset.included.stations[resolvedStationId];
  if (station == null) {
    throw new Error(
      `Station ${resolvedStationId} disappeared while building its read model`,
    );
  }

  const issues = Object.values(dataset.allIssues).filter((issue) =>
    issue.branchesAffected.some((branch) =>
      branch.stationIds.includes(resolvedStationId),
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
  const arrivalBranches = Object.values(dataset.branchByServiceId).filter(
    (branch) =>
      branch.startedAt != null &&
      branch.endedAt == null &&
      branch.entries.some((entry) => entry.stationId === station.id),
  );
  const platformRows = await timeDbQuery('station_profile_q_platforms', () =>
    db
      .select({
        id: stationPlatformsTable.platform_id,
        label: stationPlatformsTable.label,
        lineId: stationPlatformsTable.line_id,
        boardingStatus: stationPlatformsTable.boarding_status,
        serviceId: stationPlatformServicesTable.service_id,
      })
      .from(stationPlatformsTable)
      .leftJoin(
        stationPlatformServicesTable,
        and(
          eq(
            stationPlatformServicesTable.station_id,
            stationPlatformsTable.station_id,
          ),
          eq(
            stationPlatformServicesTable.platform_id,
            stationPlatformsTable.platform_id,
          ),
        ),
      )
      .where(eq(stationPlatformsTable.station_id, station.id)),
  );
  const platformsById = new Map<
    string,
    {
      id: string;
      label: string;
      lineId: string;
      boardingStatus: 'alighting_only' | 'not_in_service' | null;
      serviceIds: string[];
    }
  >();
  for (const row of platformRows) {
    const platform = platformsById.get(row.id) ?? {
      id: row.id,
      label: row.label,
      lineId: row.lineId,
      boardingStatus: row.boardingStatus,
      serviceIds: [],
    };
    if (row.serviceId != null) {
      platform.serviceIds.push(row.serviceId);
    }
    platformsById.set(row.id, platform);
  }
  const platforms = [...platformsById.values()].sort((a, b) => {
    const lineDiff = a.lineId.localeCompare(b.lineId);
    return lineDiff !== 0 ? lineDiff : a.label.localeCompare(b.label);
  });
  const boardablePlatformLabelsByServiceId = new Map<string, string[]>();
  for (const platform of platforms) {
    if (platform.boardingStatus != null) {
      continue;
    }
    for (const serviceId of platform.serviceIds) {
      const labels = boardablePlatformLabelsByServiceId.get(serviceId) ?? [];
      labels.push(platform.label);
      boardablePlatformLabelsByServiceId.set(serviceId, labels);
    }
  }
  const destinationStationIds = [
    ...new Set(
      arrivalBranches
        .map((branch) => branch.entries.at(-1)?.stationId)
        .filter((stationId): stationId is string => stationId != null),
    ),
  ];
  const destinationStationRows =
    destinationStationIds.length > 0
      ? await timeDbQuery('station_profile_q_arrival_destinations', () =>
          db
            .select({ id: stationsTable.id, name: stationsTable.name })
            .from(stationsTable)
            .where(inArray(stationsTable.id, destinationStationIds)),
        )
      : [];
  const destinationNameByStationId = Object.fromEntries(
    destinationStationRows.map((destination) => [
      destination.id,
      parseTranslations(destination.name),
    ]),
  );
  const arrivalTimings = getEstimatedStationArrivalTimings({
    station,
    services: arrivalBranches.map((branch) => {
      const destination = branch.entries.at(-1);
      return {
        serviceId: branch.id,
        lineId: branch.lineId,
        destinationCode: destination?.displayCode ?? branch.id,
        destinationName:
          destinationNameByStationId[destination?.stationId ?? ''] ?? null,
        revision: {
          path: {
            stations: branch.entries.map((entry) => ({
              stationId: entry.stationId,
              displayCode: entry.displayCode,
            })),
          },
          estimatedFrequency: branch.estimatedFrequency,
        },
      };
    }),
    referenceNow,
    publicHolidayDates: dataset.publicHolidaySet,
  }).map((timing) => ({
    ...timing,
    platformLabels: [
      ...new Set(
        boardablePlatformLabelsByServiceId.get(timing.serviceId) ?? [],
      ),
    ].sort((a, b) => a.localeCompare(b)),
  }));
  return {
    data: {
      stationId: resolvedStationId,
      status,
      issueIdsRecent,
      issueCountByType: pickIssueTypes(issues),
      communitySignals,
      arrivalTimings,
      platforms: platforms.map(
        ({ serviceIds: _serviceIds, ...platform }) => platform,
      ),
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: issueIdsRecent,
      lineIds: [
        ...new Set(communitySignals.flatMap((signal) => signal.lineIds)),
      ],
      stationIds: [
        resolvedStationId,
        ...new Set(communitySignals.flatMap((signal) => signal.stationIds)),
      ],
      includeStationDetailEntities: true,
      includeStationMembershipLines: true,
    }),
  };
}

/** @deprecated Use the explicitly scoped read-model name. */
export const getStationProfileData = getStationProfileReadModel;

export function deriveStationDirectoryStatus(
  stationIssues: readonly IssueWithOperationalEffects[],
  referenceNow = nowSg(),
): LineSummaryStatus {
  const activeIssues = stationIssues.filter((issue) =>
    issueActiveNow(issue, referenceNow),
  );

  if (activeIssues.some((issue) => issue.type === 'disruption')) {
    return 'ongoing_disruption';
  }
  if (activeIssues.some((issue) => issue.type === 'maintenance')) {
    return 'ongoing_maintenance';
  }
  if (activeIssues.some((issue) => issue.type === 'infra')) {
    return 'ongoing_infra';
  }
  return 'normal';
}

export function deriveStationDirectoryOperationalState(
  memberships: readonly Pick<Station['memberships'][number], 'startedAt'>[],
  referenceDate: string,
) {
  if (memberships.some((membership) => membership.startedAt <= referenceDate)) {
    return 'open' as const;
  }
  return memberships.length > 0 ? ('future' as const) : ('closed' as const);
}

export async function getStationsDirectoryData() {
  const referenceNow = nowSg();
  const referenceDate = isoDate(referenceNow);
  const db = await getDefaultDb();
  const [stationRows, membershipRows, townRows, activeIssueRows, latestRows] =
    await Promise.all([
      timeDbQuery('stations_directory_q_stations', () =>
        db
          .select({
            id: stationsTable.id,
            name: stationsTable.name,
            townId: stationsTable.townId,
          })
          .from(stationsTable),
      ),
      timeDbQuery('stations_directory_q_memberships', () =>
        db
          .select({
            stationId: stationCodesTable.station_id,
            lineId: stationCodesTable.line_id,
            code: stationCodesTable.code,
            startedAt: stationCodesTable.started_at,
            structureType: stationCodesTable.structure_type,
          })
          .from(stationCodesTable)
          .where(
            or(
              isNull(stationCodesTable.ended_at),
              gt(stationCodesTable.ended_at, referenceDate),
            ),
          ),
      ),
      timeDbQuery('stations_directory_q_towns', () =>
        db
          .select({ id: townsTable.id, name: townsTable.name })
          .from(townsTable),
      ),
      timeDbQuery('stations_directory_q_active_issues', () =>
        db
          .select({ issueId: issueDayFactsTable.issue_id })
          .from(issueDayFactsTable)
          .where(
            and(
              eq(issueDayFactsTable.date, referenceDate),
              eq(issueDayFactsTable.active_anytime, true),
            ),
          ),
      ),
      timeDbQuery('stations_directory_q_latest_disruptions', () =>
        db
          .selectDistinctOn([stationIssueFactsTable.station_id], {
            stationId: stationIssueFactsTable.station_id,
            issueId: stationIssueFactsTable.issue_id,
            latestActivityAt: stationIssueFactsTable.latest_activity_at,
          })
          .from(stationIssueFactsTable)
          .where(eq(stationIssueFactsTable.issue_type, 'disruption'))
          .orderBy(
            asc(stationIssueFactsTable.station_id),
            desc(stationIssueFactsTable.latest_activity_at),
            desc(stationIssueFactsTable.issue_id),
          ),
      ),
    ]);
  const activeIssueIds = activeIssueRows.map((row) => row.issueId);
  const activeDataset =
    activeIssueIds.length > 0
      ? await buildDataset(referenceNow, db, activeIssueIds)
      : null;
  const issuesByStationId = new Map<string, IssueWithOperationalEffects[]>();

  for (const issue of Object.values(activeDataset?.allIssues ?? {})) {
    const stationIds = new Set(
      issue.branchesAffected.flatMap((branch) => branch.stationIds),
    );
    for (const stationId of stationIds) {
      const stationIssues = issuesByStationId.get(stationId);
      if (stationIssues == null) {
        issuesByStationId.set(stationId, [issue]);
      } else {
        stationIssues.push(issue);
      }
    }
  }

  const membershipsByStationId = Map.groupBy(
    membershipRows,
    (membership) => membership.stationId,
  );
  const latestByStationId = new Map(
    latestRows.map((row) => [row.stationId, row]),
  );
  const stations = stationRows.map((station) => {
    const memberships = (membershipsByStationId.get(station.id) ?? []).map(
      (membership) => ({
        lineId: membership.lineId,
        branchId: `${membership.lineId}:${membership.code}`,
        code: membership.code,
        startedAt: membership.startedAt,
        endedAt: undefined,
        structureType: membership.structureType,
        sequenceOrder: 0,
      }),
    );
    const stationIssues = issuesByStationId.get(station.id) ?? [];
    const status = deriveStationDirectoryStatus(stationIssues, referenceNow);
    const operationalState = deriveStationDirectoryOperationalState(
      memberships,
      referenceDate,
    );
    const latestDisruption = latestByStationId.get(station.id);

    return {
      id: station.id,
      name: parseTranslations(station.name),
      townId: station.townId,
      memberships,
      status,
      operationalState,
      latestDisruption:
        latestDisruption == null
          ? null
          : {
              id: latestDisruption.issueId,
              at: latestDisruption.latestActivityAt,
            },
    };
  });

  const lineIds = new Set(
    stations.flatMap((station) =>
      station.memberships.map((membership) => membership.lineId),
    ),
  );
  const lineRows =
    lineIds.size > 0
      ? await timeDbQuery('stations_directory_q_lines', () =>
          db
            .select({
              id: linesTable.id,
              name: linesTable.name,
              color: linesTable.color,
              type: linesTable.type,
            })
            .from(linesTable)
            .where(inArray(linesTable.id, [...lineIds])),
        )
      : [];

  return {
    stations,
    lines: Object.fromEntries(
      lineRows.map((line) => [
        line.id,
        {
          id: line.id,
          name: parseTranslations(line.name),
          color: line.color,
          type: line.type,
        },
      ]),
    ),
    towns: Object.fromEntries(
      townRows.map((town) => [
        town.id,
        { id: town.id, name: parseTranslations(town.name) },
      ]),
    ),
  };
}
