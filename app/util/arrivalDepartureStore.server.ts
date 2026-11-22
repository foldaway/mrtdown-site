import { z } from 'zod';
import {
  DEPARTURE_PARTITION_LIMITS,
  parseDeparturePartition,
  type DeparturePartition,
} from './dbQueries/departurePartition';
import { getPageProfileRedis } from './pageProfileRedis.server';
import { createPartitionedSnapshotStore } from './partitionedSnapshotStore.server';
import type { SnapshotRedis } from './publishedSnapshotStore.server';

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
  connect: () => Promise<SnapshotRedis>,
) {
  const store = createPartitionedSnapshotStore(connect, 'arrival-departures', {
    parseManifest,
    parsePartition: parseDeparturePartition,
    partitions: (manifest) => manifest.partitions,
    partitionLimits: DEPARTURE_PARTITION_LIMITS,
  });
  type Snapshot = NonNullable<Awaited<ReturnType<typeof store.manifest.read>>>;

  async function prepare(
    partition: DeparturePartition,
    remainingBytes = MAX_DEPARTURE_TOTAL_BYTES,
  ) {
    const ref = await store.prepare(partition, remainingBytes);
    return {
      projectionId: partition.projectionId,
      stationId: partition.stationId,
      ...ref,
    };
  }

  async function readPartition(snapshot: Snapshot, ref: DeparturePartitionRef) {
    const member = snapshot.inputs.partitions.find(
      (part) =>
        part.projectionId === ref.projectionId &&
        part.stationId === ref.stationId &&
        part.sha256 === ref.sha256,
    );
    if (!member) return null;
    const partition = await store.readPartition(snapshot, member);
    if (!partition) return null;
    if (
      partition.projectionId !== ref.projectionId ||
      partition.stationId !== ref.stationId
    ) {
      await store.markForRepair(snapshot);
      return null;
    }
    return partition;
  }
  return { ...store, prepare, readPartition };
}
export const arrivalDepartureStore =
  createArrivalDepartureStore(getPageProfileRedis);
export function isArrivalDeparturePublicationEnabled() {
  return process.env.REDIS_ARRIVAL_DEPARTURES === 'publish';
}
