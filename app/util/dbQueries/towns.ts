import type { IssueType } from '@mrtdown/core';
import type { DateTime } from 'luxon';
import type { Issue, LineSummaryStatus, Station } from '~/types';
import { getBaseDataset } from './dataset';
import { isoDate, isoDateTime, nowSg, parseDateTime } from './dateTime';
import { selectIncludedEntities } from './includedEntities';
import { pickIssueTypes } from './issueAnalytics';
import {
  issueActiveNow,
  issueOverlapsRange,
  sortIssuesByLatestActivity,
} from './issueIntervals';
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

export async function getTownsData() {
  const dataset = await getBaseDataset();
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

export async function getTownProfileData(townId: string) {
  const dataset = await getBaseDataset();
  const town = dataset.included.towns[townId];
  if (town == null) {
    throw new Response('Town not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const stations = Object.values(dataset.included.stations).filter(
    (station) => station.townId === townId,
  );
  const stationIds = stations.map((station) => station.id);
  const stationIdSet = new Set(stationIds);
  const lineIds = getTownLineIds(stations);
  const issues = Object.values(dataset.allIssues).filter((issue) =>
    issue.branchesAffected.some((branch) =>
      branch.stationIds.some((stationId) => stationIdSet.has(stationId)),
    ),
  );
  const referenceNow = nowSg();
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
        Object.values(dataset.included.stations).map((station) => [
          station.id,
          station.name,
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
