import {
  createPublishedSnapshotStore,
  getSnapshotKeyPrefix,
  type SnapshotNamespace,
  type SnapshotRedis,
} from './publishedSnapshotStore.server';
import {
  decodeSnapshotPayload,
  encodeSnapshotPayload,
  type SnapshotLimits,
} from './snapshotPayload.server';

type PartitionRef = { sha256: string; bytes: number };
type PartitionedSnapshotOptions<Manifest, Partition> = {
  parseManifest: (value: unknown) => Manifest;
  parsePartition: (value: unknown) => Partition;
  partitions: (manifest: Manifest) => readonly PartitionRef[];
  partitionLimits: SnapshotLimits;
};
const PENDING_RETENTION_SECONDS = 24 * 60 * 60;
const PREPARE = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('SET', KEYS[1], ARGV[1], 'KEEPTTL')
else redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]) end
return 1`;
const READY = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
for i = 3, #KEYS do if redis.call('EXISTS', KEYS[i]) == 0 then return 0 end end
return 1`;
const MARK_REPAIR = `
if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[2], ARGV[2]) end
return 1`;

export function createPartitionedSnapshotStore<Manifest, Partition>(
  connect: () => Promise<SnapshotRedis>,
  namespace: SnapshotNamespace,
  {
    parseManifest,
    parsePartition,
    partitions,
    partitionLimits,
  }: PartitionedSnapshotOptions<Manifest, Partition>,
) {
  const manifest = createPublishedSnapshotStore(
    connect,
    namespace,
    parseManifest,
  );
  type Snapshot = NonNullable<Awaited<ReturnType<typeof manifest.read>>>;
  const prefix = () => getSnapshotKeyPrefix(namespace);
  const headKey = () => `${prefix()}:active`;
  const repairKey = () => `${prefix()}:repair`;
  function partitionKey(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid partition hash');
    return `${prefix()}:partition:${hash}`;
  }

  async function prepare(
    partition: Partition,
    remainingBytes = partitionLimits.encodedBytes,
  ) {
    const payload = encodeSnapshotPayload(
      partition,
      parsePartition,
      partitionLimits,
    );
    if (payload.bytes > remainingBytes)
      throw new Error('Snapshot partitions exceed total Redis limit');
    const redis = await connect();
    // Repairing shared content must preserve an active partition's lack of expiry.
    await redis.eval(
      PREPARE,
      1,
      partitionKey(payload.sha256),
      payload.encoded,
      PENDING_RETENTION_SECONDS,
    );
    return { sha256: payload.sha256, bytes: payload.bytes };
  }

  async function ready(snapshot: Snapshot) {
    const keys = partitions(snapshot.inputs).map((ref) =>
      partitionKey(ref.sha256),
    );
    const redis = await connect();
    return (
      (await redis.eval(
        READY,
        2 + keys.length,
        headKey(),
        repairKey(),
        ...keys,
        snapshot.raw,
      )) === 1
    );
  }

  async function publish(
    expectedRawHead: Buffer,
    inputs: Manifest,
    generation: string,
    fingerprint: string,
    previous: readonly PartitionRef[],
  ) {
    const normalized = parseManifest(inputs);
    const current = await manifest.read({ verifyPayload: true });
    // A retry may have lost the activation response. Repeat activation of an
    // identical manifest so any repaired parts also become persistent again.
    const replay =
      current &&
      current.value.generation === generation &&
      current.value.fingerprint === fingerprint &&
      JSON.stringify(current.inputs) === JSON.stringify(normalized) &&
      (await ready(current));
    return manifest.publish(
      replay ? current.raw : expectedRawHead,
      normalized,
      generation,
      fingerprint,
      {
        active: partitions(normalized).map((ref) => ref.sha256),
        previous: previous.map((ref) => ref.sha256),
      },
    );
  }

  async function markForRepair(snapshot: Snapshot) {
    const redis = await connect();
    // A reader of the preceding manifest must not dirty its replacement.
    await redis.eval(
      MARK_REPAIR,
      2,
      headKey(),
      repairKey(),
      snapshot.raw,
      snapshot.value.sha256,
    );
  }

  async function readPartition(snapshot: Snapshot, ref: PartitionRef) {
    if (
      !partitions(snapshot.inputs).some(
        (part) => part.sha256 === ref.sha256 && part.bytes === ref.bytes,
      )
    )
      return null;
    const redis = await connect();
    try {
      const encoded = await redis.getrange(
        partitionKey(ref.sha256),
        0,
        partitionLimits.encodedBytes,
      );
      return decodeSnapshotPayload(
        encoded,
        ref.sha256,
        parsePartition,
        partitionLimits,
      );
    } catch {
      await markForRepair(snapshot);
      return null;
    }
  }
  return { manifest, prepare, publish, ready, readPartition, markForRepair };
}
