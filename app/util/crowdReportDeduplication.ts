import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DateTime } from 'luxon';
import {
  crowdReportClustersTable,
  crowdReportLinesTable,
  crowdReportsTable,
  crowdReportStationsTable,
} from '~/db/schema';
import {
  crowdReportContextsMatch,
  normalizeCrowdReportDirection,
  type CrowdReportClusterContext,
} from './crowdReportClustering';
import type { CrowdReportEffect, CrowdReportSubmission } from './crowdReports';

type AppDb = ReturnType<typeof import('~/db').getDb>;
type CrowdReportReadableDb = Pick<AppDb, 'select'>;
const DUPLICATE_CANDIDATE_PAGE_SIZE = 100;

export type DuplicateCrowdReport = {
  id: string;
  clusterId: string | null;
  observedAt: string;
} & CrowdReportClusterContext;

function getIncidentEffectSql() {
  // Use the cluster's known effect so an unknown member cannot bridge
  // unrelated known effects into the same incident.
  return sql<CrowdReportEffect | null>`coalesce((
    select ${crowdReportClustersTable.effect}
    from ${crowdReportClustersTable}
    where ${crowdReportClustersTable.id} = ${crowdReportsTable.cluster_id}
  ), ${crowdReportsTable.effect})`;
}

function hasCompatibleEffectSql(
  incidentEffect: SQL<CrowdReportEffect | null>,
  reportedEffect: CrowdReportEffect,
) {
  if (reportedEffect == null || reportedEffect === 'unknown') {
    return undefined;
  }
  return or(
    isNull(incidentEffect),
    eq(incidentEffect, 'unknown'),
    eq(incidentEffect, reportedEffect),
  );
}

function isOpenDuplicateCandidateSql() {
  // Legacy reports have no cluster; clustered reports must belong to an
  // incident that has not yet been dispatched.
  const isUndispatchedLegacyReport = and(
    eq(crowdReportsTable.status, 'accepted'),
    isNull(crowdReportsTable.cluster_id),
    isNull(crowdReportsTable.dispatched_at),
  );
  const belongsToOpenCluster = sql`exists (
    select 1 from ${crowdReportClustersTable}
    where ${crowdReportClustersTable.id} = ${crowdReportsTable.cluster_id}
      and ${crowdReportClustersTable.status} in ('pending', 'accepted')
      and ${crowdReportClustersTable.dispatched_at} is null
  )`;
  return or(isUndispatchedLegacyReport, belongsToOpenCluster);
}

function hasNoConflictingClusterDirectionSql(directionText?: string) {
  const direction = normalizeCrowdReportDirection(directionText);
  if (!direction) {
    return undefined;
  }
  // Check every member, including older observations outside the time window.
  // Matching an unspecified direction must not hide a known opposite one.
  return sql`not exists (
    select 1 from ${crowdReportsTable} as member
    where member.cluster_id = ${crowdReportsTable.cluster_id}
      and member.status in ('accepted', 'duplicate')
      and coalesce(lower(trim(member.direction_text)), '') not in ('', 'not-sure', ${direction})
  )`;
}

export async function findDuplicateCrowdReport(
  db: CrowdReportReadableDb,
  reportId: string,
  submission: CrowdReportSubmission,
  duplicateWindowMinutes: number,
): Promise<DuplicateCrowdReport | undefined> {
  const observedAt = DateTime.fromISO(submission.observedAt, {
    setZone: true,
  });
  const windowStartAt = observedAt
    .minus({ minutes: duplicateWindowMinutes })
    .toUTC()
    .toISO();
  const windowEndAt = observedAt
    .plus({ minutes: duplicateWindowMinutes })
    .toUTC()
    .toISO();
  if (windowStartAt == null || windowEndAt == null) {
    return undefined;
  }

  const incidentEffect = getIncidentEffectSql();

  let offset = 0;
  while (true) {
    const candidates = await db
      .select({
        id: crowdReportsTable.id,
        observedAt: crowdReportsTable.observed_at,
        status: crowdReportsTable.status,
        directionText: crowdReportsTable.direction_text,
        effect: incidentEffect,
        duplicateOfId: crowdReportsTable.duplicate_of_id,
        clusterId: crowdReportsTable.cluster_id,
      })
      .from(crowdReportsTable)
      .where(
        and(
          ne(crowdReportsTable.id, reportId),
          hasCompatibleEffectSql(incidentEffect, submission.effect),
          inArray(crowdReportsTable.status, ['accepted', 'duplicate']),
          isOpenDuplicateCandidateSql(),
          hasNoConflictingClusterDirectionSql(submission.directionText),
          gte(crowdReportsTable.observed_at, windowStartAt),
          lte(crowdReportsTable.observed_at, windowEndAt),
        ),
      )
      .orderBy(desc(crowdReportsTable.observed_at), desc(crowdReportsTable.id))
      .offset(offset)
      .limit(DUPLICATE_CANDIDATE_PAGE_SIZE);

    const candidateIds = candidates.map((candidate) => candidate.id);
    if (candidateIds.length === 0) {
      return undefined;
    }

    const [candidateLines, candidateStations] = await Promise.all([
      db
        .select({
          reportId: crowdReportLinesTable.report_id,
          lineId: crowdReportLinesTable.line_id,
        })
        .from(crowdReportLinesTable)
        .where(inArray(crowdReportLinesTable.report_id, candidateIds))
        .limit(DUPLICATE_CANDIDATE_PAGE_SIZE * 8),
      db
        .select({
          reportId: crowdReportStationsTable.report_id,
          stationId: crowdReportStationsTable.station_id,
        })
        .from(crowdReportStationsTable)
        .where(inArray(crowdReportStationsTable.report_id, candidateIds))
        .limit(DUPLICATE_CANDIDATE_PAGE_SIZE * 16),
    ]);

    for (const candidate of candidates) {
      if (
        candidate.status !== 'accepted' &&
        !(candidate.status === 'duplicate' && candidate.clusterId != null)
      ) {
        continue;
      }

      const lineIds = candidateLines
        .filter((line) => line.reportId === candidate.id)
        .map((line) => line.lineId);
      const stationIds = candidateStations
        .filter((station) => station.reportId === candidate.id)
        .map((station) => station.stationId);

      if (
        crowdReportContextsMatch(
          { ...candidate, lineIds, stationIds },
          submission,
        )
      ) {
        return {
          ...candidate,
          // A recent corroboration extends the window, but new duplicates
          // still point directly to the original report.
          id: candidate.duplicateOfId ?? candidate.id,
          lineIds,
          stationIds,
        };
      }
    }

    if (candidates.length < DUPLICATE_CANDIDATE_PAGE_SIZE) {
      return undefined;
    }
    offset += DUPLICATE_CANDIDATE_PAGE_SIZE;
  }
}
