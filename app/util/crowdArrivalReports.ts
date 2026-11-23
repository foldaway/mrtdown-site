import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { getDb } from '~/db';
import {
  serviceRevisionPathStationEntriesTable as entries,
  crowdArrivalReportsTable as reports,
  serviceRevisionsTable as revisions,
  servicesTable as services,
} from '~/db/schema';
import {
  invalidateArrivalReportCache,
  isArrivalReportPublicationEnabled,
  lockArrivalReportPublication,
  readCachedCrowdArrival,
  repairArrivalReportCache,
} from './crowdArrivalReportCache.server';
import {
  type ArrivalBranchScope,
  CROWD_ARRIVAL_COOLDOWN_SECONDS,
  type CrowdArrivalSubmission,
  type RecentCrowdArrival,
  MAX_REPORT_AGE_MS,
  recentCrowdArrivalFromReport,
} from './crowdArrivalReportContract';
import type { ArrivalInputs } from './dbQueries/arrivalInputs';
import { isoDate, parseDateTimeUncached } from './dbQueries/dateTime';
import {
  selectServiceRevisionForReferenceDate,
  serviceRevisionIsActiveOn,
} from './serviceRevisions';

type Db = ReturnType<typeof getDb>;

async function isReportableArrivalScope(
  db: Pick<Db, 'select'>,
  scope: ArrivalBranchScope,
  referenceInstant: string,
) {
  const serviceRevisions = await db
    .select({
      id: revisions.id,
      start_at: revisions.start_at,
      end_at: revisions.end_at,
      updated_at: revisions.updated_at,
    })
    .from(revisions)
    .innerJoin(services, eq(services.id, revisions.service_id))
    .where(
      and(eq(services.id, scope.serviceId), eq(services.line_id, scope.lineId)),
    );
  const date = isoDate(parseDateTimeUncached(referenceInstant));
  const revision = selectServiceRevisionForReferenceDate(
    serviceRevisions,
    date,
  );
  if (!revision || !serviceRevisionIsActiveOn(revision, date)) return false;

  const path = await db
    .select({ stationId: entries.station_id })
    .from(entries)
    .where(
      and(
        eq(entries.service_id, scope.serviceId),
        eq(entries.service_revision_id, revision.id),
      ),
    )
    .orderBy(entries.path_index);
  return (
    path.at(-1)?.stationId === scope.destinationStationId &&
    path.slice(0, -1).some(({ stationId }) => stationId === scope.stationId)
  );
}

export async function getRecentCrowdArrival(
  database: Db | (() => Db),
  scope: ArrivalBranchScope,
  referenceInstant: string,
  options?: { sqlFallback: false; arrivalInputs: ArrivalInputs },
): Promise<RecentCrowdArrival | undefined> {
  const cached =
    process.env.REDIS_ARRIVAL_REPORTS === 'enabled'
      ? await readCachedCrowdArrival(
          scope,
          referenceInstant,
          options?.arrivalInputs,
        )
      : undefined;
  if (cached?.status === 'ready') return cached.value;
  // Reports are optional. A healthy published schedule must not wake SQL to
  // repair an unavailable signal; writers or an explicit seed restore it.
  if (options?.sqlFallback === false) return undefined;

  const db = typeof database === 'function' ? database() : database;
  if (cached?.status === 'missing') {
    await repairArrivalReportCache(db).catch((error) => {
      console.error('Arrival report cache repair failed', { error });
    });
  }
  const now = Date.parse(referenceInstant);
  const [report] = await db
    .select({
      reportedAt: reports.reported_at,
      destinationStationId: reports.destination_station_id,
      minutes: reports.minutes_to_arrival,
    })
    .from(reports)
    .where(
      and(
        eq(reports.station_id, scope.stationId),
        eq(reports.service_id, scope.serviceId),
        eq(reports.status, 'accepted'),
        gte(
          reports.reported_at,
          new Date(now - MAX_REPORT_AGE_MS).toISOString(),
        ),
        lte(reports.reported_at, referenceInstant),
      ),
    )
    .orderBy(desc(reports.reported_at), desc(reports.id))
    .limit(1);
  if (!report) return undefined;

  const value = recentCrowdArrivalFromReport(report, referenceInstant);
  if (
    !value ||
    (report.destinationStationId !== null &&
      report.destinationStationId !== scope.destinationStationId) ||
    !(await isReportableArrivalScope(db, scope, report.reportedAt))
  ) {
    return undefined;
  }
  // A report around midnight can refer to a route that has just changed.
  if (
    isoDate(parseDateTimeUncached(report.reportedAt)) !==
      isoDate(parseDateTimeUncached(referenceInstant)) &&
    !(await isReportableArrivalScope(db, scope, referenceInstant))
  ) {
    return undefined;
  }
  return value;
}

export class CrowdArrivalRateLimitError extends Error {}
export class InvalidCrowdArrivalScopeError extends Error {}

export async function submitCrowdArrival(
  db: Db,
  submission: CrowdArrivalSubmission,
  reporterHash: string,
) {
  const publish = isArrivalReportPublicationEnabled();
  await db.transaction(async (tx) => {
    if (publish) await lockArrivalReportPublication(tx);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`crowd-arrival:${reporterHash}`}, 0::bigint))`,
    );
    const receivedAt = new Date();
    const reportedAt = receivedAt.toISOString();
    const cooldownStart = new Date(
      receivedAt.getTime() - CROWD_ARRIVAL_COOLDOWN_SECONDS * 1000,
    );
    const [recent] = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.reporter_hash, reporterHash),
          gte(reports.created_at, cooldownStart),
        ),
      )
      .limit(1);
    if (recent) throw new CrowdArrivalRateLimitError();
    if (!(await isReportableArrivalScope(tx, submission, reportedAt))) {
      throw new InvalidCrowdArrivalScopeError();
    }
    if (publish) await invalidateArrivalReportCache();
    await tx.insert(reports).values({
      id: crypto.randomUUID(),
      station_id: submission.stationId,
      service_id: submission.serviceId,
      destination_station_id: submission.destinationStationId,
      minutes_to_arrival: submission.minutesToArrival,
      reported_at: reportedAt,
      created_at: receivedAt,
      reporter_hash: reporterHash,
      status: 'accepted',
    });
  });
  if (publish) {
    // The report is committed. Failed publication leaves the cache unknown;
    // do not ask the rider to resubmit an already accepted report.
    await repairArrivalReportCache(db).catch((error) => {
      console.error('Committed arrival report cache publication failed', {
        error,
      });
    });
  }
}
