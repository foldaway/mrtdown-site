import { z } from 'zod';
import {
  DEPARTURE_PARTITION_LIMITS,
  type DeparturePartition,
  parseDeparturePartition,
} from './dbQueries/departurePartition';
import { getPageProfileRedis } from './pageProfileRedis.server';
import {
  createPublishedSnapshotStore,
  type SnapshotRedis,
} from './publishedSnapshotStore.server';
import {
  createSnapshotPartitions,
  type PartitionRedis,
} from './snapshotPartitions.server';

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
  projectionDigests: z.record(z.string(), hash).optional(),
  partitions: z.array(refSchema).max(MAX_DEPARTURE_PARTITIONS),
});
export type DeparturePartitionRef = z.infer<typeof refSchema>;
export type DepartureManifest = z.infer<typeof manifestSchema>;
function parseManifest(value: unknown): DepartureManifest {
  const manifest = manifestSchema.parse(value);
  const identities = manifest.partitions.map((ref) =>
    JSON.stringify([ref.projectionId, ref.stationId]),
  );
  if (new Set(identities).size !== identities.length)
    throw new Error('Duplicate departure partition identity');
  const totalBytes = manifest.partitions.reduce(
    (sum, ref) => sum + ref.bytes,
    0,
  );
  if (totalBytes > MAX_DEPARTURE_TOTAL_BYTES)
    throw new Error('Departure manifest exceeds total Redis limit');
  return manifest;
}
export function createArrivalDepartureStore(
  connect: () => Promise<SnapshotRedis & PartitionRedis>,
) {
  const manifest = createPublishedSnapshotStore(
    connect,
    'arrival-departures',
    parseManifest,
  );
  const parts = createSnapshotPartitions(
    connect,
    'arrival-departures',
    parseDeparturePartition,
    DEPARTURE_PARTITION_LIMITS,
  );
  type Snapshot = NonNullable<Awaited<ReturnType<typeof manifest.read>>>;

  async function prepare(
    partition: DeparturePartition,
    remainingBytes = MAX_DEPARTURE_TOTAL_BYTES,
  ) {
    const ref = await parts.prepare(partition, remainingBytes);
    return {
      projectionId: partition.projectionId,
      stationId: partition.stationId,
      ...ref,
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
    // The durable activation step can retry after losing its success response.
    const replay =
      current &&
      current.value.generation === generation &&
      current.value.fingerprint === fingerprint &&
      JSON.stringify(current.inputs) === JSON.stringify(inputs);
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

  function ready(snapshot: Snapshot) {
    return parts.ready(
      snapshot.raw,
      snapshot.inputs.partitions.map((ref) => ref.sha256),
    );
  }
  async function read(ref: DeparturePartitionRef) {
    const partition = await parts.read(ref);
    if (
      partition.projectionId !== ref.projectionId ||
      partition.stationId !== ref.stationId
    )
      throw new Error('Departure partition identity mismatch');
    return partition;
  }
  return { manifest, prepare, publish, ready, read };
}
export const arrivalDepartureStore =
  createArrivalDepartureStore(getPageProfileRedis);
