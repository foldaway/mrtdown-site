import { z } from 'zod';
import { getPageProfileRedis } from './pageProfileRedis.server';

const RETENTION_SECONDS = 24 * 60 * 60;
const MEMO_MS = 5 * 60 * 1000;
const GenerationSchema = z.string().min(1).max(256);

type GenerationCacheOptions<TRows> = {
  family: string;
  label: string;
  rowsSchema: z.ZodType<TRows>;
  maxBytes: number;
  transferEvent: string;
  comparableRows?: (rows: TRows) => string;
};

/** Bounded, immutable storage. Callers own SQL snapshots, publication and flags. */
export function createGenerationCache<TRows>({
  family,
  label,
  rowsSchema,
  maxBytes,
  transferEvent,
  comparableRows = JSON.stringify,
}: GenerationCacheOptions<TRows>) {
  const EntrySchema = z.object({
    version: z.literal(1),
    generation: GenerationSchema,
    rows: rowsSchema,
  });
  type CachedRows = { rows: TRows; redisBytes: number };
  let memo: { key: string; rows: TRows; expiresAt: number } | undefined;
  let loading: { key: string; promise: Promise<CachedRows | null> } | undefined;

  function getKey(generation: string) {
    const tier = process.env.TIER ?? 'development';
    if (!/^[a-z0-9_-]+$/.test(tier)) throw new Error('Invalid cache tier');
    GenerationSchema.parse(generation);
    return `mrtdown:${tier}:${family}:v1:${encodeURIComponent(generation)}`;
  }

  function parseEntry(raw: string, generation: string) {
    if (Buffer.byteLength(raw) > maxBytes) return null;
    const parsed = EntrySchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.generation === generation
      ? parsed.data
      : null;
  }

  async function load(key: string, generation: string) {
    // GETRANGE's inclusive end reads at most the ceiling plus one byte.
    const raw = await (await getPageProfileRedis()).getrange(key, 0, maxBytes);
    const redisBytes = Buffer.byteLength(raw);
    console.info(JSON.stringify({ event: transferEvent, bytes: redisBytes }));
    const entry = raw && parseEntry(raw, generation);
    if (!entry) return null;
    memo = { key, rows: entry.rows, expiresAt: Date.now() + MEMO_MS };
    return { rows: entry.rows, redisBytes };
  }

  /** Generation must come from the caller's SQL snapshot. Reads never fill. */
  async function read(generation: string) {
    let key: string;
    try {
      key = getKey(generation);
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
      const promise = load(key, generation)
        .catch(() => null)
        .finally(() => {
          loading = undefined;
        });
      loading = { key, promise };
    }
    const hit = await loading.promise;
    if (!hit) return null;
    return {
      rows: structuredClone(hit.rows),
      source: 'redis' as const,
      redisBytes: ownsLoad ? hit.redisBytes : 0,
    };
  }

  async function publish(generation: string, rows: TRows) {
    const entry = EntrySchema.parse({ version: 1, generation, rows });
    const raw = JSON.stringify(entry);
    const bytes = Buffer.byteLength(raw);
    if (bytes > maxBytes) {
      console.warn(`[CACHE] ${label} exceed size limit`, { bytes });
      return { published: false, bytes };
    }
    const key = getKey(generation);
    const redis = await getPageProfileRedis();
    const written = await redis.set(key, raw, 'EX', RETENTION_SECONDS, 'NX');
    if (!written) {
      const prior = parseEntry(
        await redis.getrange(key, 0, maxBytes),
        generation,
      );
      if (!prior || comparableRows(prior.rows) !== comparableRows(entry.rows)) {
        throw new Error(
          `Published ${label.toLowerCase()} disagree with their generation`,
        );
      }
      if (!(await redis.expire(key, RETENTION_SECONDS))) {
        throw new Error(`${label} expired during publication; retry required`);
      }
    }
    return { published: true, bytes };
  }

  return { getKey, read, publish };
}
