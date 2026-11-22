import { z } from 'zod';
import {
  DEPARTURE_PARTITION_LIMITS,
  parseDeparturePartition,
  type DeparturePartition,
} from './dbQueries/departurePartition';
import { getPageProfileRedis } from './pageProfileRedis.server';
import {
  createPublishedSnapshotStore,
  getSnapshotKeyPrefix,
  type SnapshotRedis,
} from './publishedSnapshotStore.server';
import {
  decodeSnapshotPayload,
  encodeSnapshotPayload,
} from './snapshotPayload.server';

export const MAX_DEPARTURE_PARTITIONS = 1_000;
export const MAX_DEPARTURE_TOTAL_BYTES = 64 * 1024 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const refSchema = z.object({
  projectionId: z.number().int().positive(),
  stationId: z.string().min(1),
  sha256: hash,
  bytes: z
    .number()
    .int()
    .positive()
    .max(DEPARTURE_PARTITION_LIMITS.encodedBytes),
});
const manifestSchema = z.object({
  arrivalInputsSha256: hash,
  partitions: z.array(refSchema).max(MAX_DEPARTURE_PARTITIONS),
});
export type DeparturePartitionRef = z.infer<typeof refSchema>;
export type DepartureManifest = z.infer<typeof manifestSchema>;
function parseManifest(value: unknown): DepartureManifest {
  const manifest = manifestSchema.parse(value);
  if (
    new Set(
      manifest.partitions.map((ref) =>
        JSON.stringify([ref.projectionId, ref.stationId]),
      ),
    ).size !== manifest.partitions.length ||
    manifest.partitions.reduce((sum, ref) => sum + ref.bytes, 0) >
      MAX_DEPARTURE_TOTAL_BYTES
  )
    throw new Error('Invalid departure manifest bounds');
  return manifest;
}
const RETENTION_SECONDS = 86400;

export function createArrivalDepartureStore(
  connect: () => Promise<SnapshotRedis>,
) {
  const manifest = createPublishedSnapshotStore(
    connect,
    'arrival-departures',
    parseManifest,
  );
  const prefix = () => getSnapshotKeyPrefix('arrival-departures');
  const key = (sha256: string) => `${prefix()}:partition:${hash.parse(sha256)}`;

  async function prepare(
    partition: DeparturePartition,
    remainingBytes = MAX_DEPARTURE_TOTAL_BYTES,
  ) {
    const payload = encodeSnapshotPayload(
      partition,
      parseDeparturePartition,
      DEPARTURE_PARTITION_LIMITS,
    );
    if (payload.bytes > remainingBytes)
      throw new Error('Departure publication exceeds total Redis limit');
    const redis = await connect();
    // Repair existing content without adding expiry to a shared active part.
    await redis.eval(
      `
      if redis.call('EXISTS', KEYS[1]) == 1 then
        redis.call('SET', KEYS[1], ARGV[1], 'KEEPTTL')
      else redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]) end
      return 1`,
      1,
      key(payload.sha256),
      payload.encoded,
      RETENTION_SECONDS,
    );
    return {
      projectionId: partition.projectionId,
      stationId: partition.stationId,
      sha256: payload.sha256,
      bytes: payload.bytes,
    };
  }

  async function publish(
    expectedRawHead: Buffer,
    inputs: DepartureManifest,
    generation: string,
    fingerprint: string,
    previous: DeparturePartitionRef[],
  ) {
    const current = await manifest.read({ verifyPayload: true });
    // A retry may have lost the activation response. Reuse only an identical
    // manifest, then repeat atomic activation to persist any repaired parts.
    const replay =
      current &&
      current.value.generation === generation &&
      current.value.fingerprint === fingerprint &&
      JSON.stringify(current.inputs) === JSON.stringify(inputs) &&
      (await ready(current));
    return manifest.publish(
      replay ? current.raw : expectedRawHead,
      inputs,
      generation,
      fingerprint,
      {
        active: inputs.partitions.map((ref) => ref.sha256),
        previous: previous.map((ref) => ref.sha256),
      },
    );
  }

  type Snapshot = NonNullable<Awaited<ReturnType<typeof manifest.read>>>;
  async function ready(snapshot: Snapshot) {
    const redis = await connect();
    return (
      (await redis.eval(
        `
      if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
      for i = 3, #KEYS do if redis.call('EXISTS', KEYS[i]) == 0 then return 0 end end
      return 1`,
        2 + snapshot.inputs.partitions.length,
        `${prefix()}:active`,
        `${prefix()}:repair`,
        ...snapshot.inputs.partitions.map((ref) => key(ref.sha256)),
        snapshot.raw,
      )) === 1
    );
  }

  async function readPartition(snapshot: Snapshot, ref: DeparturePartitionRef) {
    if (
      !snapshot.inputs.partitions.some(
        (part) =>
          part.sha256 === ref.sha256 &&
          part.projectionId === ref.projectionId &&
          part.stationId === ref.stationId,
      )
    )
      return null;
    const redis = await connect();
    try {
      const encoded = await redis.getrange(
        key(ref.sha256),
        0,
        DEPARTURE_PARTITION_LIMITS.encodedBytes,
      );
      const partition = decodeSnapshotPayload(
        encoded,
        ref.sha256,
        parseDeparturePartition,
        DEPARTURE_PARTITION_LIMITS,
      );
      if (
        partition.projectionId !== ref.projectionId ||
        partition.stationId !== ref.stationId
      )
        throw new Error('Departure partition identity mismatch');
      return partition;
    } catch {
      // An old reader must not mark a replacement publication for repair.
      await redis.eval(
        `
        if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[2], ARGV[2]) end
        return 1`,
        2,
        `${prefix()}:active`,
        `${prefix()}:repair`,
        snapshot.raw,
        snapshot.value.sha256,
      );
      return null;
    }
  }
  return { manifest, prepare, publish, ready, readPartition };
}
export const arrivalDepartureStore =
  createArrivalDepartureStore(getPageProfileRedis);
export function isArrivalDeparturePublicationEnabled() {
  return process.env.REDIS_ARRIVAL_DEPARTURES === 'publish';
}
