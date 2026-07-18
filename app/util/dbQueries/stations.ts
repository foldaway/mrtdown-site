import type { Line, LineSummaryStatus, Station } from '~/types';
import { asc, eq, inArray } from 'drizzle-orm';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  servicesTable,
  stationCodesTable,
  stationLandmarksTable,
  stationsTable,
} from '~/db/schema';
import {
  type CommunitySignalOptions,
  getPageCommunitySignals,
} from './communitySignals';
import { getDefaultDb, timeDbQuery } from './database';
import { buildDataset, getCompleteDataset } from './dataset';
import { isoDate, nowSg, parseDateTime } from './dateTime';
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
  const dataset = await buildDataset(undefined, db, candidateIssueIds, {
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

/** @deprecated Use the explicitly scoped read-model name. */
export const getStationProfileData = getStationProfileReadModel;

export async function getStationsDirectoryData() {
  const dataset = await getCompleteDataset('route:/stations');
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
