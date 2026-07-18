import type { Line, LineSummaryStatus, Station } from '~/types';
import {
  type CommunitySignalOptions,
  getPageCommunitySignals,
} from './communitySignals';
import { getCompleteDataset } from './dataset';
import { isoDate, nowSg, parseDateTime } from './dateTime';
import { selectIncludedEntities } from './includedEntities';
import { pickIssueTypes } from './issueAnalytics';
import {
  type IssueWithOperationalEffects,
  issueActiveNow,
  sortIssuesByLatestActivity,
} from './issueIntervals';

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

export async function getStationProfileData(
  stationId: string,
  options: CommunitySignalOptions = {},
) {
  const dataset = await getCompleteDataset();
  const resolvedStationId = resolveStationProfileStationId(
    dataset.included,
    stationId,
  );
  if (resolvedStationId == null) {
    throw new Response('Station not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const station = dataset.included.stations[resolvedStationId];
  if (station == null) {
    throw new Response('Station not found', {
      status: 404,
      statusText: 'Not Found',
    });
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
  const communitySignals = await getPageCommunitySignals(options, {
    stationId: resolvedStationId,
  });

  return {
    data: {
      stationId: resolvedStationId,
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
        resolvedStationId,
        ...new Set(communitySignals.flatMap((signal) => signal.stationIds)),
      ],
      includeStationDetailEntities: true,
      includeStationMembershipLines: true,
    }),
  };
}

export async function getStationsDirectoryData() {
  const dataset = await getCompleteDataset();
  const referenceNow = nowSg();
  const referenceDate = isoDate(referenceNow);
  const issuesByStationId = new Map<string, IssueWithOperationalEffects[]>();

  for (const issue of Object.values(dataset.allIssues)) {
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

  const stations = Object.values(dataset.included.stations).map((station) => {
    const memberships = station.memberships.filter(
      (membership) => membership.endedAt == null,
    );
    const stationIssues = issuesByStationId.get(station.id) ?? [];
    const activeIssues = stationIssues.filter((issue) =>
      issueActiveNow(issue, referenceNow),
    );

    let status: LineSummaryStatus = 'normal';
    if (activeIssues.some((issue) => issue.type === 'disruption')) {
      status = 'ongoing_disruption';
    } else if (activeIssues.some((issue) => issue.type === 'maintenance')) {
      status = 'ongoing_maintenance';
    } else if (activeIssues.some((issue) => issue.type === 'infra')) {
      status = 'ongoing_infra';
    }

    const hasStartedMembership = memberships.some(
      (membership) => membership.startedAt <= referenceDate,
    );
    const operationalState = hasStartedMembership
      ? 'open'
      : memberships.length > 0
        ? 'future'
        : 'closed';
    const latestDisruptionId = sortIssuesByLatestActivity(
      stationIssues
        .filter((issue) => issue.type === 'disruption')
        .map((issue) => issue.id),
      dataset.allIssues,
    )[0];
    const latestDisruption =
      latestDisruptionId == null ? null : dataset.allIssues[latestDisruptionId];
    const latestDisruptionAt =
      latestDisruption == null
        ? null
        : latestDisruption.intervals.reduce<string | null>(
            (latest, interval) => {
              const candidate = interval.endAt ?? interval.startAt;
              if (
                latest == null ||
                parseDateTime(candidate) > parseDateTime(latest)
              ) {
                return candidate;
              }
              return latest;
            },
            null,
          );

    return {
      id: station.id,
      name: station.name,
      townId: station.townId,
      memberships,
      status,
      operationalState,
      latestDisruption:
        latestDisruptionId == null || latestDisruptionAt == null
          ? null
          : { id: latestDisruptionId, at: latestDisruptionAt },
    };
  });

  const lineIds = new Set(
    stations.flatMap((station) =>
      station.memberships.map((membership) => membership.lineId),
    ),
  );
  const townIds = new Set(stations.map((station) => station.townId));

  return {
    stations,
    lines: Object.fromEntries(
      [...lineIds]
        .map((lineId) => dataset.included.lines[lineId])
        .filter((line): line is Line => line != null)
        .map((line) => [
          line.id,
          {
            id: line.id,
            name: line.name,
            color: line.color,
            type: line.type,
          },
        ]),
    ),
    towns: Object.fromEntries(
      [...townIds]
        .map((townId) => dataset.included.towns[townId])
        .filter((town): town is NonNullable<typeof town> => town != null)
        .map((town) => [town.id, town]),
    ),
  };
}
