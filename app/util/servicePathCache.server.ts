import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { type AppDbReader, getDefaultDb } from './dbQueries/database';
import {
  readServicePathRows,
  type ServicePathRow,
} from './dbQueries/servicePaths';
import { getPageProfileRedis } from './pageProfileRedis.server';
import { recordServerTiming } from './serverTiming';

export const MAX_SERVICE_PATH_CACHE_BYTES = 512 * 1024;
const RETENTION_SECONDS = 24 * 60 * 60;
const MEMO_MS = 5 * 60 * 1000;
const EntrySchema = z.object({
  version: z.literal(1),
  generation: z.string().min(1).max(256),
  rows: z.array(
    z.object({
      service_revision_id: z.string().min(1),
      service_id: z.string().min(1),
      station_id: z.string().min(1),
      display_code: z.string(),
      path_index: z.number().int().nonnegative(),
    }),
  ),
});
type CachedPaths = { rows: ServicePathRow[]; redisBytes: number };
let memo:
  | { key: string; rows: ServicePathRow[]; expiresAt: number }
  | undefined;
let loading: { key: string; promise: Promise<CachedPaths | null> } | undefined;

export function isServicePathCacheEnabled() {
  return process.env.REDIS_SERVICE_PATH_CACHE === 'enabled';
}

export function isServicePathCachePublicationEnabled() {
  return (
    isServicePathCacheEnabled() ||
    process.env.REDIS_SERVICE_PATH_CACHE === 'publish'
  );
}

export function getServicePathCacheKey(generation: string) {
  const tier = process.env.TIER ?? 'development';
  if (!/^[a-z0-9_-]+$/.test(tier)) throw new Error('Invalid cache tier');
  EntrySchema.shape.generation.parse(generation);
  return `mrtdown:${tier}:service-paths:v1:${encodeURIComponent(generation)}`;
}

function parseEntry(raw: string, generation: string) {
  if (Buffer.byteLength(raw) > MAX_SERVICE_PATH_CACHE_BYTES) return null;
  const parsed = EntrySchema.safeParse(JSON.parse(raw));
  return parsed.success && parsed.data.generation === generation
    ? parsed.data
    : null;
}

async function loadCachedPaths(key: string, generation: string) {
  const redis = await getPageProfileRedis();
  // Read at most the ceiling plus one byte, including for malformed keys.
  const raw = await redis.getrange(key, 0, MAX_SERVICE_PATH_CACHE_BYTES);
  const redisBytes = Buffer.byteLength(raw);
  console.info(
    JSON.stringify({ event: 'service_path_cache_transfer', bytes: redisBytes }),
  );
  const entry = raw && parseEntry(raw, generation);
  if (!entry) return null;

  memo = { key, rows: entry.rows, expiresAt: Date.now() + MEMO_MS };
  return { rows: entry.rows, redisBytes };
}

/** The caller must obtain generation from its owning SQL snapshot. No fills on reads. */
export async function readCachedServicePaths(generation: string) {
  let key: string;
  try {
    key = getServicePathCacheKey(generation);
  } catch {
    return null;
  }
  if (memo?.key === key && memo.expiresAt > Date.now()) {
    return {
      rows: structuredClone(memo.rows),
      source: 'memory' as const,
      redisBytes: 0,
    };
  }
  if (loading && loading.key !== key) return null;
  const ownsLoad = !loading;
  if (!loading) {
    const promise = loadCachedPaths(key, generation)
      .catch(() => null)
      .finally(() => {
        loading = undefined;
      });
    loading = { key, promise };
  }
  const hit = await loading.promise;
  if (!hit) return null;
  return {
    source: 'redis' as const,
    redisBytes: ownsLoad ? hit.redisBytes : 0,
    rows: structuredClone(hit.rows),
  };
}

/** Read through the transaction that owns issue discovery and dataset assembly. */
export async function readServicePathsForSnapshot(
  db: AppDbReader,
  range: { start: string; end: string },
) {
  const startedAt = performance.now();
  const generation = await readCompletedPageProfileGeneration(db);
  const paths = generation ? await readCachedServicePaths(generation) : null;
  const source = paths?.source ?? 'sql';
  const redisBytes = paths?.redisBytes ?? 0;
  recordServerTiming(
    'service_paths_load',
    performance.now() - startedAt,
    source,
  );
  recordServerTiming('service_paths_redis_bytes', 0, String(redisBytes));
  try {
    if (process.env.TIER === 'staging') {
      setResponseHeader('X-MRTDown-Service-Paths-Source', source);
    }
    if (!paths) setResponseHeader('Cache-Control', 'no-store');
  } catch {
    // Scripts and maintenance probes have no request context.
  }
  console.info(
    JSON.stringify({
      event: 'service_path_cache_read',
      source,
      redisBytes,
      rangeStart: range.start,
      rangeEnd: range.end,
    }),
  );
  return paths?.rows;
}

/** Called under the pull lease, after promotion and before purge/fingerprint completion. */
export async function publishServicePathCache(expectedGeneration?: string) {
  const db = await getDefaultDb();
  const entry = await db.transaction(
    async (tx) => {
      const generation = await readCompletedPageProfileGeneration(tx);
      if (
        !generation ||
        (expectedGeneration && generation !== expectedGeneration)
      ) {
        throw new Error(
          'Service paths require a completed matching generation',
        );
      }
      const rows = await readServicePathRows(tx);
      // Stable encoding allows publication retries to verify immutable contents.
      rows.sort(
        (a, b) =>
          a.service_id.localeCompare(b.service_id) ||
          a.service_revision_id.localeCompare(b.service_revision_id) ||
          a.path_index - b.path_index,
      );
      return EntrySchema.parse({ version: 1, generation, rows });
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const raw = JSON.stringify(entry);
  const bytes = Buffer.byteLength(raw);
  if (bytes > MAX_SERVICE_PATH_CACHE_BYTES) {
    console.warn('[CACHE] Service paths exceed size limit', { bytes });
    return { published: false, bytes };
  }
  const key = getServicePathCacheKey(entry.generation);
  const redis = await getPageProfileRedis();
  const written = await redis.set(key, raw, 'EX', RETENTION_SECONDS, 'NX');
  if (!written) {
    const prior = parseEntry(
      await redis.getrange(key, 0, MAX_SERVICE_PATH_CACHE_BYTES),
      entry.generation,
    );
    if (!prior || JSON.stringify(prior.rows) !== JSON.stringify(entry.rows)) {
      throw new Error('Published service paths disagree with their generation');
    }
    // Unchanged-manifest pulls renew retention without changing the generation.
    if (!(await redis.expire(key, RETENTION_SECONDS))) {
      throw new Error(
        'Service paths expired during publication; retry required',
      );
    }
  }
  console.info('[CACHE] Published service paths', {
    generation: entry.generation,
    bytes,
    rows: entry.rows.length,
  });
  return { published: true, bytes };
}
