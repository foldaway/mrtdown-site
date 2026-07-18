import type { IssueType } from '@mrtdown/core';
import { eq, inArray, or } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  servicesTable,
  stationCodesTable,
  stationsTable,
  townsTable,
} from '~/db/schema';
import type { Issue, LineSummaryStatus, Station } from '~/types';
import { getDefaultDb, timeDbQuery } from './database';
import { buildDataset, getCompleteDataset, parseTranslations } from './dataset';
import { isoDate, isoDateTime, nowSg, parseDateTime } from './dateTime';
import { selectIncludedEntities } from './includedEntities';
import { pickIssueTypes } from './issueAnalytics';
import {
  issueActiveNow,
  issueOverlapsRange,
  sortIssuesByLatestActivity,
} from './issueIntervals';
import { getIssueStaticScope } from './readModelScope';
import { isLineOperatingNow } from './serviceOperations';

export type TownStationStatus = LineSummaryStatus | 'not_in_service';

export const TOWN_RECENT_ISSUE_DAYS = 90;

const STATION_MAP_SNAPSHOT_DATES = [
  '2012-01-01',
  '2017-11-01',
  '2019-12-01',
  '2024-11-01',
  '2025-04-01',
  '2026-07-01',
  '2027-12-01',
  '2029-12-01',
  '2030-12-01',
  '2032-12-01',
];

export function getTownLineIds(stations: Array<Pick<Station, 'memberships'>>) {
  return [
    ...new Set(
      stations.flatMap((station) =>
        station.memberships
          .filter((membership) => membership.endedAt == null)
          .map((membership) => membership.lineId),
      ),
    ),
  ].sort();
}

function getIssueStatus(issueTypes: readonly IssueType[]): LineSummaryStatus {
  if (issueTypes.includes('disruption')) {
    return 'ongoing_disruption';
  }
  if (issueTypes.includes('maintenance')) {
    return 'ongoing_maintenance';
  }
  if (issueTypes.includes('infra')) {
    return 'ongoing_infra';
  }
  return 'normal';
}

export function deriveTownStationStatus(
  memberships: Station['memberships'],
  activeIssueTypes: readonly IssueType[],
  operatingLineIds: ReadonlySet<string>,
  referenceNow: DateTime,
): TownStationStatus {
  const activeMemberships = memberships.filter(
    (membership) =>
      parseDateTime(membership.startedAt) <= referenceNow &&
      (membership.endedAt == null ||
        parseDateTime(membership.endedAt) > referenceNow),
  );

  if (activeMemberships.length === 0) {
    const hasFutureMembership = memberships.some(
      (membership) => parseDateTime(membership.startedAt) > referenceNow,
    );
    return hasFutureMembership ? 'future_service' : 'not_in_service';
  }

  const issueStatus = getIssueStatus(activeIssueTypes);
  if (issueStatus !== 'normal') {
    return issueStatus;
  }

  return activeMemberships.some((membership) =>
    operatingLineIds.has(membership.lineId),
  )
    ? 'normal'
    : 'closed_for_day';
}

export function deriveTownStatus(
  stationStatuses: readonly TownStationStatus[],
): TownStationStatus {
  const issueStatus = getIssueStatus(
    stationStatuses.flatMap((status): IssueType[] => {
      switch (status) {
        case 'ongoing_disruption':
          return ['disruption'];
        case 'ongoing_maintenance':
          return ['maintenance'];
        case 'ongoing_infra':
          return ['infra'];
        default:
          return [];
      }
    }),
  );
  if (issueStatus !== 'normal') {
    return issueStatus;
  }
  if (stationStatuses.includes('normal')) {
    return 'normal';
  }
  if (stationStatuses.includes('closed_for_day')) {
    return 'closed_for_day';
  }
  if (stationStatuses.includes('future_service')) {
    return 'future_service';
  }
  return 'not_in_service';
}

export function deriveTownMapReferenceDate(
  stations: Array<Pick<Station, 'memberships'>>,
  referenceNow: DateTime,
) {
  const latestFutureStart = stations.reduce<DateTime | null>(
    (latestStationStart, station) => {
      const hasActiveMembership = station.memberships.some(
        (membership) =>
          parseDateTime(membership.startedAt) <= referenceNow &&
          (membership.endedAt == null ||
            parseDateTime(membership.endedAt) > referenceNow),
      );
      if (hasActiveMembership) {
        return latestStationStart;
      }

      const firstStationStart = station.memberships
        .map((membership) => parseDateTime(membership.startedAt))
        .filter((startedAt) => startedAt > referenceNow)
        .sort((a, b) => a.toMillis() - b.toMillis())[0];
      if (
        firstStationStart == null ||
        (latestStationStart != null && firstStationStart <= latestStationStart)
      ) {
        return latestStationStart;
      }
      return firstStationStart;
    },
    null,
  );

  if (latestFutureStart == null) {
    return referenceNow;
  }

  return (
    STATION_MAP_SNAPSHOT_DATES.map(parseDateTime).find(
      (snapshotDate) =>
        snapshotDate.startOf('month') >= latestFutureStart.startOf('month'),
    ) ?? latestFutureStart
  );
}

export function getTownRecentIssueWindow(referenceNow: DateTime) {
  const start = referenceNow
    .startOf('day')
    .minus({ days: TOWN_RECENT_ISSUE_DAYS - 1 });
  return {
    start,
    end: start.plus({ days: TOWN_RECENT_ISSUE_DAYS }),
  };
}

export function selectRecentTownIssueIds(
  issues: readonly Issue[],
  issuesById: Record<string, Issue>,
  referenceNow: DateTime,
  limit = 10,
) {
  const window = getTownRecentIssueWindow(referenceNow);
  return sortIssuesByLatestActivity(
    issues
      .filter((issue) =>
        issueOverlapsRange(issue, window.start, window.end, referenceNow),
      )
      .map((issue) => issue.id),
    issuesById,
  ).slice(0, limit);
}

async function getTownCandidateIssueIds(
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
      ? timeDbQuery('town_profile_q_service_issues', () =>
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
      : timeDbQuery('town_profile_q_facility_issues', () =>
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

export function mergeTownReadModelScope(input: {
  townLineIds: readonly string[];
  townServiceIds: readonly string[];
  townStationIds: readonly string[];
  issueScope: {
    lineIds: readonly string[];
    serviceIds: readonly string[];
    stationIds: readonly string[];
  };
}) {
  return {
    lineIds: [...new Set([...input.townLineIds, ...input.issueScope.lineIds])],
    serviceIds: [
      ...new Set([...input.townServiceIds, ...input.issueScope.serviceIds]),
    ],
    stationIds: [
      ...new Set([...input.townStationIds, ...input.issueScope.stationIds]),
    ],
  };
}

export async function getTownsData() {
  const dataset = await getCompleteDataset('route:/towns');
  const stations = Object.values(dataset.included.stations);
  const towns = Object.values(dataset.included.towns).map((town) => {
    const townStations = stations.filter(
      (station) => station.townId === town.id,
    );
    const stationIds = townStations.map((station) => station.id);
    const lineIds = getTownLineIds(townStations);

    return {
      townId: town.id,
      stationIds,
      lineIds,
    };
  });

  return {
    data: { towns },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: [],
      lineIds: towns.flatMap((town) => town.lineIds),
      townIds: towns.map((town) => town.townId),
    }),
  };
}

export async function getTownProfileReadModel(townId: string) {
  const referenceNow = nowSg();
  const db = await getDefaultDb();
  const [townRow] = await timeDbQuery('town_profile_q_root', () =>
    db
      .select({ id: townsTable.id })
      .from(townsTable)
      .where(eq(townsTable.id, townId))
      .limit(1),
  );
  if (townRow == null) {
    throw new Response('Town not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const [townStationRows, allStationNameRows] = await Promise.all([
    timeDbQuery('town_profile_q_stations', () =>
      db
        .select({ id: stationsTable.id })
        .from(stationsTable)
        .where(eq(stationsTable.townId, townId)),
    ),
    timeDbQuery('town_profile_q_station_names', () =>
      db
        .select({ id: stationsTable.id, name: stationsTable.name })
        .from(stationsTable),
    ),
  ]);
  const townStationIds = townStationRows.map((row) => row.id);
  const townStationCodeRows =
    townStationIds.length > 0
      ? await timeDbQuery('town_profile_q_station_codes', () =>
          db
            .select({ lineId: stationCodesTable.line_id })
            .from(stationCodesTable)
            .where(inArray(stationCodesTable.station_id, townStationIds)),
        )
      : [];
  const townLineIds = [
    ...new Set(townStationCodeRows.map((row) => row.lineId)),
  ];
  const townServiceRows =
    townLineIds.length > 0
      ? await timeDbQuery('town_profile_q_services', () =>
          db
            .select({ id: servicesTable.id })
            .from(servicesTable)
            .where(inArray(servicesTable.line_id, townLineIds)),
        )
      : [];
  const townServiceIds = townServiceRows.map((row) => row.id);
  const candidateIssueIds = await getTownCandidateIssueIds(
    townLineIds,
    townServiceIds,
    townStationIds,
    db,
  );
  const issueScope = await getIssueStaticScope(
    candidateIssueIds,
    db,
    'town_profile',
  );
  const initialScope = mergeTownReadModelScope({
    townLineIds,
    townServiceIds,
    townStationIds,
    issueScope,
  });
  const stationMembershipRows =
    initialScope.stationIds.length > 0
      ? await timeDbQuery('town_profile_q_membership_lines', () =>
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
    townIds: [townId],
    includePublicHolidays: true,
  });
  const town = dataset.included.towns[townId];
  if (town == null) {
    throw new Error(`Town ${townId} disappeared while building its read model`);
  }

  const stations = townStationIds.map((stationId) => {
    const station = dataset.included.stations[stationId];
    if (station == null) {
      throw new Error(
        `Station ${stationId} disappeared while building town ${townId}`,
      );
    }
    return station;
  });
  const stationIds = stations.map((station) => station.id);
  const stationIdSet = new Set(stationIds);
  const lineIds = getTownLineIds(stations);
  const issues = Object.values(dataset.allIssues).filter((issue) =>
    issue.branchesAffected.some((branch) =>
      branch.stationIds.some((stationId) => stationIdSet.has(stationId)),
    ),
  );
  const activeIssues = issues.filter((issue) =>
    issueActiveNow(issue, referenceNow),
  );
  const operatingLineIds = new Set(
    lineIds.filter((lineId) =>
      isLineOperatingNow(
        dataset.included.lines[lineId],
        dataset.publicHolidaySet,
        referenceNow,
      ),
    ),
  );
  const stationStatuses = Object.fromEntries(
    stationIds.map((stationId) => {
      const station = dataset.included.stations[stationId];
      const stationIssues = activeIssues.filter((issue) =>
        issue.branchesAffected.some((branch) =>
          branch.stationIds.includes(stationId),
        ),
      );
      return [
        stationId,
        deriveTownStationStatus(
          station.memberships,
          stationIssues.map((issue) => issue.type),
          operatingLineIds,
          referenceNow,
        ),
      ];
    }),
  ) as Record<string, TownStationStatus>;
  const townStatus = deriveTownStatus(Object.values(stationStatuses));
  const issueIdsRecent = selectRecentTownIssueIds(
    issues,
    dataset.allIssues,
    referenceNow,
  );
  const mapReferenceDate = deriveTownMapReferenceDate(stations, referenceNow);

  return {
    data: {
      townId,
      stationIds,
      lineIds,
      status: townStatus,
      stationStatuses,
      issueIdsRecent,
      issueCountByType: pickIssueTypes(issues),
      referenceNow: isoDateTime(referenceNow),
      recentIssueDays: TOWN_RECENT_ISSUE_DAYS,
      mapReferenceDate: isoDate(mapReferenceDate),
      stationNames: Object.fromEntries(
        allStationNameRows.map((station) => [
          station.id,
          parseTranslations(station.name),
        ]),
      ),
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: issueIdsRecent,
      lineIds,
      stationIds,
      townIds: [townId],
      includeStationMembershipLines: true,
    }),
  };
}

/** @deprecated Use the explicitly scoped read-model name. */
export const getTownProfileData = getTownProfileReadModel;
