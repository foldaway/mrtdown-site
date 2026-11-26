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
  | 'issue-profiles'
  | 'station-profiles'
  | 'range-snapshot'
  | 'sitemap'
  | 'statistics'
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
  let memo: { hash: string; inputs: T } | undefined;
  const headKey = () => `${prefix()}:active`;
  const payloadKey = (hash: string) => `${prefix()}:payload:${hash}`;

  async function head() {
    const redis = await connect();
    const raw = await redis.getrangeBuffer(headKey(), 0, MAX_HEAD_BYTES);
    return { raw, value: parseHead(raw) };
  }

  async function read({ verifyPayload = false } = {}) {
    try {
      const current = await head();
      if (!current.value) return null;
      const hash = current.value.sha256;
      if (!verifyPayload && memo?.hash === hash) {
        return {
          ...current,
          value: current.value,
          inputs: structuredClone(memo.inputs),
          source: 'memory' as const,
          redisBytes: 0,
        };
      }
      const redis = await connect();
      const encoded = await redis.getrange(
        payloadKey(hash),
        0,
        MAX_ENCODED_BYTES,
      );
      if (!encoded || Buffer.byteLength(encoded) > MAX_ENCODED_BYTES)
        return null;
      if (snapshotDigest(encoded) !== hash) return null;
      if (memo?.hash !== hash) {
        memo = {
          hash,
          inputs: decodeSnapshotPayload(encoded, hash, parseInputs),
        };
      }
      return {
        ...current,
        value: current.value,
        inputs: structuredClone(memo.inputs),
        source: 'redis' as const,
        redisBytes: Buffer.byteLength(encoded),
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

  return { read, head, publish };
}
