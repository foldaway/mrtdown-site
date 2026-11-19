import { setResponseHeader } from '@tanstack/react-start/server';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { getDefaultDb } from './dbQueries/database';
import {
  type RangeReferenceRows,
  RangeReferenceRowsSchema,
  readRangeReferenceRows,
} from './dbQueries/rangeReferences';
import { createGenerationCache } from './generationCache.server';
import { recordServerTiming } from './serverTiming';

export const MAX_RANGE_REFERENCE_CACHE_BYTES = 512 * 1024;

// SQL has no table-row ordering contract. Compare row sets on retries while
// preserving the first published order used by membership/landmark assembly.
function comparableRows(rows: RangeReferenceRows) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(rows).map(([key, values]) => [
        key,
        values.map((row) => JSON.stringify(row)).sort(),
      ]),
    ),
  );
}

const cache = createGenerationCache({
  family: 'range-references',
  label: 'Range references',
  rowsSchema: RangeReferenceRowsSchema,
  maxBytes: MAX_RANGE_REFERENCE_CACHE_BYTES,
  transferEvent: 'range_reference_cache_transfer',
  comparableRows,
});

export const getRangeReferenceCacheKey = cache.getKey;
export const readCachedRangeReferences = cache.read;

export function isRangeReferenceCacheEnabled() {
  return process.env.REDIS_RANGE_REFERENCE_CACHE === 'enabled';
}

export function isRangeReferenceCachePublicationEnabled() {
  return (
    isRangeReferenceCacheEnabled() ||
    process.env.REDIS_RANGE_REFERENCE_CACHE === 'publish'
  );
}

export async function readRangeReferencesForSnapshot(
  generation: string | undefined,
  range: { start: string; end: string },
) {
  const startedAt = performance.now();
  const hit = generation ? await readCachedRangeReferences(generation) : null;
  const source = hit?.source ?? 'sql';
  const redisBytes = hit?.redisBytes ?? 0;
  recordServerTiming(
    'range_references_load',
    performance.now() - startedAt,
    source,
  );
  recordServerTiming('range_references_redis_bytes', 0, String(redisBytes));
  try {
    if (process.env.TIER === 'staging') {
      setResponseHeader('X-MRTDown-Range-References-Source', source);
    }
    if (!hit) setResponseHeader('Cache-Control', 'no-store');
  } catch {
    // Maintenance callers have no request context.
  }
  console.info(
    JSON.stringify({
      event: 'range_reference_cache_read',
      source,
      redisBytes,
      rangeStart: range.start,
      rangeEnd: range.end,
    }),
  );
  return hit?.rows;
}

/** Called under the pull lease, after promotion and before purge/fingerprint completion. */
export async function publishRangeReferenceCache(expectedGeneration?: string) {
  const db = await getDefaultDb();
  const entry = await db.transaction(
    async (tx) => {
      const generation = await readCompletedPageProfileGeneration(tx);
      if (
        !generation ||
        (expectedGeneration && generation !== expectedGeneration)
      ) {
        throw new Error(
          'Range references require a completed matching generation',
        );
      }
      const rows = await readRangeReferenceRows(tx);
      return { generation, rows };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const result = await cache.publish(entry.generation, entry.rows);
  if (result.published) {
    console.info('[CACHE] Published range references', {
      generation: entry.generation,
      bytes: result.bytes,
      rows: Object.values(entry.rows).reduce(
        (sum, rows) => sum + rows.length,
        0,
      ),
    });
  }
  return result;
}
