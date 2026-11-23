import type Redis from 'ioredis';
import {
  getSnapshotKeyPrefix,
  type SnapshotNamespace,
} from './publishedSnapshotStore.server';
import {
  decodeSnapshotPayload,
  encodeSnapshotPayload,
  type SnapshotLimits,
} from './snapshotPayload.server';

export type PartitionRedis = Pick<Redis, 'set' | 'exists' | 'getrangeBuffer'>;
const PENDING_RETENTION_SECONDS = 24 * 60 * 60;

export function createSnapshotPartitions<T>(
  connect: () => Promise<PartitionRedis>,
  namespace: SnapshotNamespace,
  parse: (value: unknown) => T,
  limits: SnapshotLimits,
) {
  const prefix = () => getSnapshotKeyPrefix(namespace);
  function key(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid partition hash');
    return `${prefix()}:partition:${hash}`;
  }

  async function prepare(inputs: T, remainingBytes: number) {
    const { encoded, sha256, bytes } = encodeSnapshotPayload(
      inputs,
      parse,
      limits,
    );
    if (bytes > remainingBytes)
      throw new Error('Snapshot partitions exceed total Redis limit');
    const redis = await connect();
    const partitionKey = key(sha256);
    await redis.set(
      partitionKey,
      encoded,
      'EX',
      PENDING_RETENTION_SECONDS,
      'NX',
    );
    // Rewriting an existing active part must preserve its lack of expiry.
    if ((await redis.set(partitionKey, encoded, 'KEEPTTL', 'XX')) !== 'OK')
      throw new Error('Snapshot partition disappeared during preparation');
    return { sha256, bytes };
  }

  async function ready(expectedHead: Buffer, hashes: string[]) {
    const redis = await connect();
    const keys = hashes.map(key);
    if (keys.length && (await redis.exists(...keys)) !== keys.length)
      return false;
    const head = await redis.getrangeBuffer(`${prefix()}:active`, 0, 2048);
    return head.equals(expectedHead);
  }
  async function read(ref: { sha256: string; bytes: number }) {
    const redis = await connect();
    const raw = await redis.getrangeBuffer(
      key(ref.sha256),
      0,
      limits.encodedBytes,
    );
    if (raw.length !== ref.bytes)
      throw new Error('Missing or oversized snapshot partition');
    return decodeSnapshotPayload(
      raw.toString('utf8'),
      ref.sha256,
      parse,
      limits,
    );
  }
  return { prepare, ready, read };
}
