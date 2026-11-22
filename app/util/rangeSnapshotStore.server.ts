import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type Redis from 'ioredis';
import { z } from 'zod';
import type { DatasetInputs } from './dbQueries/dataset';
import { parseRangeSnapshotInputs } from './dbQueries/rangeSnapshotInputs';
import { getPageProfileRedis } from './pageProfileRedis.server';

const MAX_ENCODED_BYTES = 4 * 1024 * 1024;
const MAX_JSON_BYTES = 24 * 1024 * 1024;
const PREVIOUS_RETENTION_SECONDS = 24 * 60 * 60;
const MAX_HEAD_BYTES = 2048;
const digest = (raw: string) => createHash('sha256').update(raw).digest('hex');
const HeadSchema = z.object({
  version: z.literal(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  generation: z.string().min(1).max(200),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type RangeSnapshotHead = z.infer<typeof HeadSchema>;

function prefix() {
  const tier = process.env.TIER ?? 'development';
  if (!/^[a-z0-9_-]+$/.test(tier)) throw new Error('Invalid snapshot tier');
  // Keep multi-key publication in one hash slot on Redis Cluster as well.
  return `mrtdown:{${tier}:range-snapshot:v1}`;
}

type Store = Pick<Redis, 'getrange' | 'set' | 'eval' | 'del'>;

function parseHead(raw: string): RangeSnapshotHead | undefined {
  try {
    return HeadSchema.parse(JSON.parse(raw));
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
redis.call('SET', KEYS[2], ARGV[4])
redis.call('SET', KEYS[1], ARGV[2])
if KEYS[3] ~= KEYS[2] then redis.call('EXPIRE', KEYS[3], ARGV[3]) end
return 1`;

export function createRangeSnapshotStore(connect: () => Promise<Store>) {
  let memo: { hash: string; inputs: DatasetInputs } | undefined;
  const headKey = () => `${prefix()}:active`;
  const payloadKey = (hash: string) => `${prefix()}:payload:${hash}`;
  const checkpointKey = () => `${prefix()}:completed`;
  const writerKey = (owner: string) => `${prefix()}:writer:${owner}`;

  async function head() {
    const redis = await connect();
    const raw = await redis.getrange(headKey(), 0, MAX_HEAD_BYTES);
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
      if (digest(encoded) !== hash) return null;
      if (memo?.hash !== hash) {
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
        const json = gunzipSync(Buffer.from(encoded, 'base64'), {
          maxOutputLength: MAX_JSON_BYTES,
        }).toString('utf8');
        memo = { hash, inputs: parseRangeSnapshotInputs(JSON.parse(json)) };
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
    expectedRawHead: string,
    inputs: DatasetInputs,
    generation: string,
    fingerprint: string,
  ) {
    const normalized = parseRangeSnapshotInputs(inputs);
    const json = JSON.stringify(normalized);
    if (Buffer.byteLength(json) > MAX_JSON_BYTES)
      throw new Error('Range snapshot exceeds JSON limit');
    const encoded = gzipSync(json).toString('base64');
    if (Buffer.byteLength(encoded) > MAX_ENCODED_BYTES)
      throw new Error('Range snapshot exceeds Redis limit');
    const next = HeadSchema.parse({
      version: 1,
      sha256: digest(encoded),
      generation,
      fingerprint,
    });
    const redis = await connect();
    const key = payloadKey(next.sha256);
    const previous = parseHead(expectedRawHead);
    const result = await redis.eval(
      PUBLISH,
      3,
      headKey(),
      key,
      previous ? payloadKey(previous.sha256) : key,
      expectedRawHead,
      JSON.stringify(next),
      PREVIOUS_RETENTION_SECONDS,
      encoded,
    );
    if (result !== 1)
      throw new Error(
        'Range snapshot publication superseded; retry from current SQL state',
      );
    return { ...next, bytes: Buffer.byteLength(encoded) };
  }

  async function isCurrent(fingerprint: string) {
    const current = await read({ verifyPayload: true });
    if (!current || current.value.fingerprint !== fingerprint) return false;
    const redis = await connect();
    const checkpoint = await redis.getrange(checkpointKey(), 0, 128);
    return checkpoint === fingerprint;
  }

  return {
    read,
    head,
    publish,
    isCurrent,
    markWriter: async (owner: string) => {
      const redis = await connect();
      await redis.set(writerKey(owner), '1', 'EX', 86400);
    },
    hasWriter: async (owner: string) => {
      const redis = await connect();
      return (await redis.getrange(writerKey(owner), 0, 1)) === '1';
    },
    finishWriter: async (owner: string) => {
      const redis = await connect();
      await redis.del(writerKey(owner));
    },
    complete: async (fingerprint: string) => {
      if (!/^[a-f0-9]{64}$/.test(fingerprint))
        throw new Error('Invalid fingerprint');
      const current = await head();
      if (current.value?.fingerprint !== fingerprint)
        throw new Error('Cannot checkpoint superseded range inputs');
      const redis = await connect();
      const result = await redis.eval(
        `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2]); return 1`,
        2,
        headKey(),
        checkpointKey(),
        current.raw,
        fingerprint,
      );
      if (result !== 1) throw new Error('Range checkpoint superseded; retry');
    },
  };
}

export const rangeSnapshotStore = createRangeSnapshotStore(getPageProfileRedis);

export function isRangeSnapshotPublicationEnabled() {
  return ['enabled', 'publish'].includes(
    process.env.REDIS_RANGE_SNAPSHOT ?? '',
  );
}

export function isRangeSnapshotEnabled() {
  return process.env.REDIS_RANGE_SNAPSHOT === 'enabled';
}
