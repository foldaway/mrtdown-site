import { getPageProfileRedis } from './pageProfileRedis.server';
import {
  createPublishedSnapshotStore,
  getSnapshotKeyPrefix,
  type PublishedSnapshotHead,
  type SnapshotRedis,
} from './publishedSnapshotStore.server';
import { parseRangeSnapshotInputs } from './dbQueries/rangeSnapshotInputs';

export type RangeSnapshotHead = PublishedSnapshotHead;

export function createRangeSnapshotStore(
  connect: () => Promise<SnapshotRedis>,
) {
  const { read, head, publish } = createPublishedSnapshotStore(
    connect,
    'range-snapshot',
    parseRangeSnapshotInputs,
  );
  const prefix = () => getSnapshotKeyPrefix('range-snapshot');
  const headKey = () => `${prefix()}:active`;
  const checkpointKey = () => `${prefix()}:completed`;
  const writerKey = (owner: string) => `${prefix()}:writer:${owner}`;
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
    invalidateCompletion: async () => {
      const redis = await connect();
      await redis.del(checkpointKey());
    },
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
