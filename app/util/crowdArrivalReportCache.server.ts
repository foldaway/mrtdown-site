import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { crowdArrivalReportsTable as reports } from '~/db/schema';
import { arrivalInputSnapshotStore } from './arrivalInputSnapshot.server';
import {
  type ArrivalBranchScope,
  MAX_REPORT_AGE_MS,
  recentCrowdArrivalFromReport,
} from './crowdArrivalReportContract';
import { isoDate, parseDateTimeUncached } from './dbQueries/dateTime';
import type { AppDb, AppDbTransaction } from './dbQueries/database';
import { getPageProfileRedis } from './pageProfileRedis.server';
import {
  selectServiceRevisionForReferenceDate,
  serviceRevisionIsActiveOn,
} from './serviceRevisions';

const MAX_REPORTS = 10_000;
const MAX_SCOPE_BYTES = 2 * 1024 * 1024;
const reportSchema = z.object({
  reportedAt: z.iso.datetime({ offset: true }),
  minutes: z.number().int().min(0).max(30),
});
const rowsSchema = z.array(reportSchema).max(MAX_REPORTS);
const readySchema = z.object({ since: z.number().finite() });
const scopeKey = (scope: Pick<ArrivalBranchScope, 'stationId' | 'serviceId'>) =>
  JSON.stringify([scope.stationId, scope.serviceId]);

function cacheKey() {
  const tier = process.env.TIER ?? 'development';
  if (!/^[a-z0-9_-]+$/.test(tier)) throw Error('Invalid report cache tier');
  return `mrtdown:${tier}:arrival-reports:v1`;
}

export function isArrivalReportPublicationEnabled() {
  return ['publish', 'enabled'].includes(
    process.env.REDIS_ARRIVAL_REPORTS ?? '',
  );
}

export async function lockArrivalReportPublication(tx: AppDbTransaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('crowd-arrival-publication', 0::bigint))`,
  );
}

// Acknowledged invalidation precedes SQL commit. If Redis is unavailable, the
// opt-in writer fails before inserting; it cannot silently leave a cached empty.
export async function invalidateArrivalReportCache() {
  const redis = await getPageProfileRedis();
  await redis.hset(
    cacheKey(),
    'ready',
    JSON.stringify({ pending: crypto.randomUUID() }),
  );
}

/** Explicit seed/repair; also runs after committed writes, never on a timer. */
export async function repairArrivalReportCache(db: AppDb) {
  await db.transaction(async (tx) => {
    await lockArrivalReportPublication(tx);
    const redis = (await getPageProfileRedis()).duplicate();
    try {
      await redis.connect();
      // The SQL lock excludes uncommitted writers. WATCH also fences a Redis
      // command delayed past a timeout and past this transaction's lock release.
      await redis.watch(cacheKey());
      const since = Date.now();
      const rows = await tx
        .select({
          stationId: reports.station_id,
          serviceId: reports.service_id,
          reportedAt: reports.reported_at,
          minutes: reports.minutes_to_arrival,
        })
        .from(reports)
        .where(
          and(
            eq(reports.status, 'accepted'),
            gte(
              reports.reported_at,
              new Date(since - MAX_REPORT_AGE_MS).toISOString(),
            ),
          ),
        )
        .orderBy(desc(reports.reported_at), desc(reports.id))
        .limit(MAX_REPORTS + 1);
      if (rows.length > MAX_REPORTS)
        throw Error('Arrival report cache row limit exceeded');
      const grouped = new Map<string, z.infer<typeof reportSchema>[]>();
      for (const row of rows) {
        const field = scopeKey(row);
        const group = grouped.get(field) ?? [];
        group.push({
          reportedAt: new Date(row.reportedAt).toISOString(),
          minutes: row.minutes,
        });
        grouped.set(field, group);
      }
      const fields: Record<string, string> = {
        ready: JSON.stringify({ since }),
      };
      for (const [field, group] of grouped) {
        fields[field] = JSON.stringify(rowsSchema.parse(group));
        if (Buffer.byteLength(fields[field]) > MAX_SCOPE_BYTES)
          throw Error('Arrival report cache byte limit exceeded');
      }
      // One key holds readiness and all scopes: eviction cannot turn a missing
      // scope into authoritative empty while leaving its readiness marker intact.
      const result = await redis
        .multi()
        .del(cacheKey())
        .hset(cacheKey(), fields)
        .exec();
      if (!result || result.some(([error]) => error))
        throw Error('Arrival report publication failed or superseded');
    } finally {
      redis.disconnect();
    }
  });
}

/** A ready result can contain no signal. Missing/unavailable is never empty. */
export async function readCachedCrowdArrival(
  scope: ArrivalBranchScope,
  referenceInstant: string,
) {
  try {
    const redis = await getPageProfileRedis();
    const [readyRaw, rowsRaw] = await redis.hmget(
      cacheKey(),
      'ready',
      scopeKey(scope),
    );
    const ready = readySchema.safeParse(readyRaw ? JSON.parse(readyRaw) : null);
    const now = Date.parse(referenceInstant);
    if (!ready.success || now < ready.data.since)
      return { status: 'missing' } as const;
    if (rowsRaw && Buffer.byteLength(rowsRaw) > MAX_SCOPE_BYTES)
      return { status: 'missing' } as const;
    const rows = rowsSchema.parse(rowsRaw ? JSON.parse(rowsRaw) : []);
    // Select before checking expiry or scope. An expired/ineligible latest row
    // must suppress older rows, exactly as the SQL LIMIT 1 reader does.
    const report = rows.find((row) => {
      const at = Date.parse(row.reportedAt);
      return at <= now && at >= now - MAX_REPORT_AGE_MS;
    });
    const value =
      report && recentCrowdArrivalFromReport(report, referenceInstant);
    if (!value) return { status: 'ready', value: undefined } as const;
    const snapshot = await arrivalInputSnapshotStore.read();
    if (!snapshot) return { status: 'unavailable' } as const;
    const service = snapshot.inputs.topology.services.find(
      (row) => row.id === scope.serviceId && row.lineId === scope.lineId,
    );
    const revisions = [];
    for (const revision of service?.revisions ?? []) {
      const recency = snapshot.inputs.serviceRevisionRecency.find(
        (row) => row.serviceId === service?.id && row.id === revision.id,
      );
      if (!recency) return { status: 'unavailable' } as const;
      revisions.push({
        ...revision,
        start_at: revision.startAt,
        end_at: revision.endAt,
        updated_at: recency.updatedAt,
      });
    }
    for (const instant of new Set([
      isoDate(parseDateTimeUncached(report.reportedAt)),
      isoDate(parseDateTimeUncached(referenceInstant)),
    ])) {
      const revision = selectServiceRevisionForReferenceDate(
        revisions,
        instant,
      );
      if (
        !revision ||
        !serviceRevisionIsActiveOn(revision, instant) ||
        revision.stations.at(-1)?.stationId !== scope.destinationStationId ||
        !revision.stations
          .slice(0, -1)
          .some((row) => row.stationId === scope.stationId)
      ) {
        return { status: 'ready', value: undefined } as const;
      }
    }
    return { status: 'ready', value } as const;
  } catch {
    return { status: 'unavailable' } as const;
  }
}
