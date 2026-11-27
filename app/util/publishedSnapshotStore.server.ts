import { isUtf8 } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { z } from 'zod';

import {
  DEFAULT_SNAPSHOT_LIMITS,
  decodeSnapshotPayload,
  encodeSnapshotPayload,
  snapshotDigest,
} from './snapshotPayload.server';

const MAX_ENCODED_BYTES = DEFAULT_SNAPSHOT_LIMITS.encodedBytes;
const PREVIOUS_RETENTION_SECONDS = 24 * 60 * 60;
const MAX_HEAD_BYTES = 2048;
const HeadSchema = z.object({
  version: z.literal(1),
  publicationId: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  generation: z.string().min(1).max(200),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PublishedSnapshotHead = z.infer<typeof HeadSchema>;

export type SnapshotRedis = Pick<
  Redis,
  'getrange' | 'getrangeBuffer' | 'set' | 'eval' | 'del'
>;
export type SnapshotNamespace =
  | 'community-report-sources'
  | 'issue-profiles'
  | 'station-profiles'
  | 'range-snapshot'
  | 'sitemap'
  | 'statistics'
  | 'report-references'
  | 'arrival-inputs'
  | 'arrival-departures';

export function getSnapshotKeyPrefix(namespace: SnapshotNamespace) {
  const tier = process.env.TIER ?? 'development';
  if (!/^[a-z0-9_-]+$/.test(tier)) throw new Error('Invalid snapshot tier');
  // Multi-key publication must remain in one Redis Cluster hash slot.
  return `mrtdown:{${tier}:${namespace}:v1}`;
}

function parseHead(raw: string | Buffer): PublishedSnapshotHead | undefined {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (bytes.length > MAX_HEAD_BYTES || !isUtf8(bytes)) return undefined;
  try {
    return HeadSchema.parse(JSON.parse(bytes.toString('utf8')));
  } catch {
    // Keep the raw value so a publisher can replace a malformed head via CAS.
    return undefined;
  }
}

// The immutable payload and head become visible together. CAS rejects delayed
// producers, and rewriting the content-addressed value repairs corruption.
const PUBLISH = `
local current = redis.call('GET', KEYS[1]) or ''
if string.len(current) > ${MAX_HEAD_BYTES} then current = string.sub(current, 1, ${MAX_HEAD_BYTES + 1}) end
if current ~= ARGV[1] then return 0 end
local activeCount = tonumber(ARGV[5]) or 0
for i = 4, 3 + activeCount do
  if redis.call('EXISTS', KEYS[i]) == 0 then return -1 end
end
redis.call('SET', KEYS[2], ARGV[4])
redis.call('SET', KEYS[1], ARGV[2])
if KEYS[3] ~= KEYS[2] then redis.call('EXPIRE', KEYS[3], ARGV[3]) end
local active = {}
for i = 4, 3 + activeCount do
  active[KEYS[i]] = true
  redis.call('PERSIST', KEYS[i])
end
local previousCount = tonumber(ARGV[6]) or 0
for i = 4 + activeCount, 3 + activeCount + previousCount do
  if not active[KEYS[i]] then redis.call('EXPIRE', KEYS[i], ARGV[3]) end
end
return 1`;

export function createPublishedSnapshotStore<T>(
  connect: () => Promise<SnapshotRedis>,
  namespace: SnapshotNamespace,
  parseInputs: (value: unknown) => T,
) {
  const prefix = () => getSnapshotKeyPrefix(namespace);
  let memo: { key: string; inputs: T } | undefined;
  type Payload = { inputs: T; redisBytes: number } | null;
  const loading = new Map<string, Promise<Payload>>();
  let nextLoad = 0;
  let memoLoad = 0;
  const headKey = () => `${prefix()}:active`;
  const payloadKey = (hash: string) => `${prefix()}:payload:${hash}`;

  async function head() {
    const redis = await connect();
    const raw = await redis.getrangeBuffer(headKey(), 0, MAX_HEAD_BYTES);
    return { raw, value: parseHead(raw) };
  }

  async function loadPayload(key: string, hash: string): Promise<Payload> {
    const load = ++nextLoad;
    const redis = await connect();
    const encoded = await redis.getrange(key, 0, MAX_ENCODED_BYTES);
    if (!encoded || Buffer.byteLength(encoded) > MAX_ENCODED_BYTES) return null;
    if (snapshotDigest(encoded) !== hash) return null;
    const inputs =
      memo?.key === key
        ? memo.inputs
        : decodeSnapshotPayload(encoded, hash, parseInputs);
    // A delayed old publication must not evict a more recently loaded memo.
    if (load >= memoLoad) {
      memo = { key, inputs };
      memoLoad = load;
    }
    return { inputs, redisBytes: Buffer.byteLength(encoded) };
  }

  // Select before copying so scoped readers need not clone unrelated evidence.
  async function readSelected<R>(
    select: (inputs: T) => R,
    { verifyPayload = false } = {},
  ) {
    try {
      const current = await head();
      if (!current.value) return null;
      const hash = current.value.sha256;
      const key = payloadKey(hash);
      if (!verifyPayload && memo?.key === key) {
        return {
          ...current,
          value: current.value,
          inputs: structuredClone(select(memo.inputs)),
          source: 'memory' as const,
          redisBytes: 0,
        };
      }
      let shared = false;
      let payload: Payload;
      if (verifyPayload) {
        // Readiness/repair checks must inspect Redis even while a fill is pending.
        payload = await loadPayload(key, hash);
      } else {
        let pending = loading.get(key);
        shared = pending != null;
        if (!pending) {
          pending = loadPayload(key, hash).finally(() => loading.delete(key));
          loading.set(key, pending);
        }
        payload = await pending;
      }
      if (!payload) return null;
      return {
        ...current,
        value: current.value,
        // Use this load's inputs: another publication can replace the memo
        // before a waiting caller resumes. Each caller receives its own copy.
        inputs: structuredClone(select(payload.inputs)),
        source: 'redis' as const,
        redisBytes: shared ? 0 : payload.redisBytes,
      };
    } catch {
      return null;
    }
  }

  async function publish(
    expectedRawHead: string | Buffer,
    inputs: T,
    generation: string,
    fingerprint: string,
    dependencies?: { active: string[]; previous: string[] },
  ) {
    const { encoded, sha256, bytes } = encodeSnapshotPayload(
      inputs,
      parseInputs,
    );
    const next = HeadSchema.parse({
      version: 1,
      publicationId: randomUUID(),
      sha256,
      generation,
      fingerprint,
    });
    const redis = await connect();
    const key = payloadKey(next.sha256);
    const previous = parseHead(expectedRawHead);
    const dependencyKeys = dependencies
      ? [...dependencies.active, ...dependencies.previous].map((hash) => {
          if (!/^[a-f0-9]{64}$/.test(hash))
            throw new Error('Invalid partition hash');
          return `${prefix()}:partition:${hash}`;
        })
      : [];
    const result = await redis.eval(
      PUBLISH,
      3 + dependencyKeys.length,
      headKey(),
      key,
      previous ? payloadKey(previous.sha256) : key,
      ...dependencyKeys,
      expectedRawHead,
      JSON.stringify(next),
      PREVIOUS_RETENTION_SECONDS,
      encoded,
      ...(dependencies
        ? [dependencies.active.length, dependencies.previous.length]
        : []),
    );
    if (result === -1)
      throw new Error('Snapshot partition missing before activation');
    if (result !== 1)
      throw new Error(
        'Snapshot publication superseded; retry from current SQL state',
      );
    return { ...next, bytes };
  }

  const read = (options?: { verifyPayload?: boolean }) =>
    readSelected((inputs) => inputs, options);
  return { read, readSelected, head, publish };
}
