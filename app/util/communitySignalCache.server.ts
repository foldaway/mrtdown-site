import { IngestContentCrowdReportEffectSchema } from '@mrtdown/ingest-contracts';
import { sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { crowdReportClustersTable, crowdReportsTable } from '~/db/schema';
import {
  DEFAULT_PUBLIC_SIGNAL_MAX_AGE_MINUTES,
  getPublicCrowdReportSignals,
  PAGE_COMMUNITY_SIGNAL_POLICY,
  type PublicCrowdReportSignal,
} from './crowdReports';
import {
  invalidateCrowdReportSources,
  tryRepairCrowdReportSources,
} from './crowdReportSourceCache.server';
import type { AppDb, AppDbTransaction } from './dbQueries/database';
import { getPageProfileRedis } from './pageProfileRedis.server';

const MAX_SIGNALS = 10_000;
const MAX_BYTES = 4 * 1024 * 1024;
const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));
const snapshotSchema = z.object({
  initializedAt: z.number().finite(),
  // Optional for rolling upgrades: snapshots from older writers prove nothing
  // about the durable dispatch queue.
  dispatchQueueEmpty: z.boolean().optional(),
  signals: z
    .array(
      z.object({
        id: z.string(),
        effect: IngestContentCrowdReportEffectSchema.nullable(),
        reportCount: z.number().int().positive(),
        lineIds: z.array(z.string()),
        stationIds: z.array(z.string()),
        windowStartAt: timestamp,
        windowEndAt: timestamp,
        updatedAt: timestamp,
      }),
    )
    .max(MAX_SIGNALS),
});

export function getCommunitySignalCacheKey() {
  const tier = process.env.TIER ?? 'development';
  if (!/^[a-z0-9_-]+$/.test(tier))
    throw Error('Invalid community signal cache tier');
  return `mrtdown:${tier}:community-signals:v1`;
}

export async function lockCommunitySignalPublication(tx: AppDbTransaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('community-signal-publication', 0::bigint))`,
  );
}

/** Fence display changes just before commit, after all incident work/locks. */
export async function withCommunitySignalPublication<T>(
  db: AppDb,
  write: (tx: AppDbTransaction) => Promise<T>,
  hasDisplayChanges: (result: T) => boolean = () => true,
): Promise<T> {
  const publish = Boolean(process.env.REDIS_URL);
  try {
    return await db.transaction(async (tx) => {
      const result = await write(tx);
      if (publish && hasDisplayChanges(result)) {
        await invalidateCrowdReportSources(tx);
        // A unique dirty value fences even a delayed invalidation of an already
        // dirty key. Failure here rolls back before accepting a display change.
        const redis = await getPageProfileRedis();
        await redis.set(
          getCommunitySignalCacheKey(),
          JSON.stringify({ pending: crypto.randomUUID() }),
        );
      }
      return result;
    });
  } finally {
    // Repair committed writes and rolled-back attempts alike. A committed write
    // stays accepted if publication fails; unknown data continues to use SQL.
    if (publish) {
      await tryRepairCommunitySignalCache(db);
      await tryRepairCrowdReportSources(db);
    }
  }
}

export async function tryRepairCommunitySignalCache(db: AppDb) {
  if (!process.env.REDIS_URL) return;
  try {
    await repairCommunitySignalCache(db, { onlyIfMissing: true });
  } catch (error) {
    console.error('Community signal cache publication failed', { error });
  }
}

/** Explicit initialization/repair, independent of canonical pulls and timers. */
export async function repairCommunitySignalCache(
  db: AppDb,
  options: { onlyIfMissing?: boolean } = {},
) {
  await db.transaction(async (tx) => {
    await lockCommunitySignalPublication(tx);
    // Replays and rolled-back attempts must not dirty a healthy snapshot. Check
    // inside the lock so a preceding writer/repair can satisfy this request.
    if (
      options.onlyIfMissing &&
      (await readCommunitySignalSnapshot().catch(() => undefined))
        ?.dispatchQueueEmpty != null
    )
      return;
    const redis = (await getPageProfileRedis()).duplicate();
    try {
      await redis.connect();
      // The SQL lock excludes writer commits; WATCH also fences commands that execute
      // after a timeout has released that lock. No older repair can win later.
      await redis.set(
        getCommunitySignalCacheKey(),
        JSON.stringify({ pending: crypto.randomUUID() }),
      );
      await redis.watch(getCommunitySignalCacheKey());
      const initializedAt = Date.now();
      const signals = await getPublicCrowdReportSignals(tx, {
        now: DateTime.fromMillis(initializedAt),
        ...PAGE_COMMUNITY_SIGNAL_POLICY,
        limit: MAX_SIGNALS + 1,
      });
      // A conservative superset of dispatch eligibility. Ignore confidence and
      // scope so pending retries cannot be hidden by an empty display snapshot.
      // Neither eligibility nor retry has a request-clock transition today.
      const queue = await tx.execute<{ empty: boolean }>(sql`
        select not exists (
          select 1 from ${crowdReportClustersTable}
          where ${crowdReportClustersTable.status} = 'accepted'
            and ${crowdReportClustersTable.dispatched_at} is null
        ) and not exists (
          select 1 from ${crowdReportsTable}
          where ${crowdReportsTable.status} = 'accepted'
            and ${crowdReportsTable.dispatched_at} is null
            and ${crowdReportsTable.cluster_id} is null
        ) as empty
      `);
      const raw = JSON.stringify(
        snapshotSchema.parse({
          initializedAt,
          signals,
          dispatchQueueEmpty: queue.rows[0]?.empty === true,
        }),
      );
      if (Buffer.byteLength(raw) > MAX_BYTES)
        throw Error('Community signal cache byte limit exceeded');
      const result = await redis
        .multi()
        .set(getCommunitySignalCacheKey(), raw)
        .exec();
      if (!result || result.some(([error]) => error))
        throw Error('Community signal publication failed or superseded');
    } finally {
      redis.disconnect();
    }
  });
}

type CachedSignals =
  | { status: 'ready'; signals: PublicCrowdReportSignal[] }
  | { status: 'missing' | 'unavailable' };

async function readCommunitySignalSnapshot() {
  const redis = await getPageProfileRedis();
  const raw = await redis.getrange(getCommunitySignalCacheKey(), 0, MAX_BYTES);
  if (!raw || Buffer.byteLength(raw) > MAX_BYTES) return;
  const parsed = snapshotSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : undefined;
}

/** Missing, old, dirty, corrupt and unavailable snapshots always require SQL. */
export async function canSkipCrowdReportDispatch() {
  try {
    const snapshot = await readCommunitySignalSnapshot();
    return (
      snapshot?.dispatchQueueEmpty === true &&
      snapshot.initializedAt <= Date.now()
    );
  } catch {
    return false;
  }
}

export async function readCachedCommunitySignals(
  scope: { lineId?: string; stationId?: string; now?: DateTime } = {},
): Promise<CachedSignals> {
  try {
    const snapshot = await readCommunitySignalSnapshot();
    const now = (scope.now ?? DateTime.now()).toMillis();
    // A historical clock may need reports outside the publication window.
    if (!snapshot || !Number.isFinite(now) || now < snapshot.initializedAt)
      return { status: 'missing' };
    const activeSince = now - DEFAULT_PUBLIC_SIGNAL_MAX_AGE_MINUTES * 60_000;
    return {
      status: 'ready',
      signals: snapshot.signals
        .filter(
          (signal) =>
            Date.parse(signal.windowEndAt) >= activeSince &&
            (signal.lineIds.length > 0 || signal.stationIds.length > 0) &&
            (!scope.lineId || signal.lineIds.includes(scope.lineId)) &&
            (!scope.stationId || signal.stationIds.includes(scope.stationId)),
        )
        .slice(0, PAGE_COMMUNITY_SIGNAL_POLICY.limit),
    };
  } catch {
    return { status: 'unavailable' };
  }
}
