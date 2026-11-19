import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { getDefaultDb } from './dbQueries/database';
import { readServicePathRows } from './dbQueries/servicePaths';
import { createGenerationCache } from './generationCache.server';
import { recordServerTiming } from './serverTiming';

export const MAX_SERVICE_PATH_CACHE_BYTES = 512 * 1024;
const cache = createGenerationCache({
  family: 'service-paths',
  label: 'Service paths',
  maxBytes: MAX_SERVICE_PATH_CACHE_BYTES,
  transferEvent: 'service_path_cache_transfer',
  rowsSchema: z.array(
    z.object({
      service_revision_id: z.string().min(1),
      service_id: z.string().min(1),
      station_id: z.string().min(1),
      display_code: z.string(),
      path_index: z.number().int().nonnegative(),
    }),
  ),
});

export const getServicePathCacheKey = cache.getKey;
export const readCachedServicePaths = cache.read;

export function isServicePathCacheEnabled() {
  return process.env.REDIS_SERVICE_PATH_CACHE === 'enabled';
}

export function isServicePathCachePublicationEnabled() {
  return (
    isServicePathCacheEnabled() ||
    process.env.REDIS_SERVICE_PATH_CACHE === 'publish'
  );
}

/** Read through the transaction that owns issue discovery and dataset assembly. */
export async function readServicePathsForSnapshot(
  generation: string | undefined,
  range: { start: string; end: string },
) {
  const startedAt = performance.now();
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
      rows.sort(
        (a, b) =>
          a.service_id.localeCompare(b.service_id) ||
          a.service_revision_id.localeCompare(b.service_revision_id) ||
          a.path_index - b.path_index,
      );
      return { generation, rows };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const result = await cache.publish(entry.generation, entry.rows);
  if (result.published) {
    console.info('[CACHE] Published service paths', {
      generation: entry.generation,
      bytes: result.bytes,
      rows: entry.rows.length,
    });
  }
  return result;
}
