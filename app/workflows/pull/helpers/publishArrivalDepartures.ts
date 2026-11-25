import { and, eq, sql } from 'drizzle-orm';
import { readCanonicalTopologyAttestation } from '~/db/canonicalTopologyPromotion';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { scheduledDepartureProjectionsTable as projections } from '~/db/scheduledDepartures.schema';
import {
  arrivalDepartureStore,
  type DeparturePartitionRef,
  MAX_DEPARTURE_PARTITIONS,
  MAX_DEPARTURE_TOTAL_BYTES,
} from '~/util/arrivalDepartureStore.server';
import { arrivalInputSnapshotStore } from '~/util/arrivalInputSnapshot.server';
import type { ArrivalInputs } from '~/util/dbQueries/arrivalInputs';
import { type AppDbTransaction, getDefaultDb } from '~/util/dbQueries/database';
import {
  type DeparturePartitionIdentity,
  readDeparturePartition,
} from '~/util/dbQueries/readDeparturePartition';
import { snapshotDigest } from '~/util/snapshotPayload.server';
import { assertPullWorkflowLease } from './workflowLease';

type RunStep = <T>(name: string, callback: () => Promise<T>) => Promise<T>;
type Projection = ArrivalInputs['projections'][number];
const MAX_PUBLICATION_PLAN_BYTES = 256 * 1024;

/** Step results contain only identities and hashes, never departure payloads. */
export async function publishArrivalDepartures(
  run: RunStep,
  owner: string,
  fingerprint: string,
) {
  if (!process.env.REDIS_URL) return;
  const plan = await run('plan-arrival-departures', async () => {
    const [arrivals, previous, head] = await Promise.all([
      arrivalInputSnapshotStore.read({ verifyPayload: true }),
      arrivalDepartureStore.manifest.read({ verifyPayload: true }),
      arrivalDepartureStore.manifest.head(),
    ]);
    if (!arrivals || arrivals.value.fingerprint !== fingerprint)
      throw new Error(
        'Departure publication requires matching arrival metadata',
      );
    // A separate head read must not turn stale references into a new CAS token.
    if (previous && !previous.raw.equals(head.raw))
      throw new Error('Departure publication changed while planning');
    const indexed = arrivals.inputs.projections.filter(
      (row) => row.completedAt !== null,
    );
    const projectionDigests = Object.fromEntries(
      indexed.map((projection) => [
        projection.id,
        snapshotDigest(JSON.stringify({ version: 1, projection })),
      ]),
    );
    const parts = new Map<string, DeparturePartitionIdentity>();
    for (const scope of arrivals.inputs.scopes) {
      if (projectionDigests[scope.projection_id]) {
        const part = {
          projectionId: scope.projection_id,
          stationId: scope.station_id,
        };
        parts.set(JSON.stringify([part.projectionId, part.stationId]), part);
      }
    }
    if (parts.size > MAX_DEPARTURE_PARTITIONS)
      throw new Error('Departure publication plan exceeds bounds');
    const previousParts = previous?.inputs.partitions ?? [];
    // Store references once; reuse indices keep the durable plan within its limit.
    const previousIndices = new Map(
      previousParts.map((ref, index) => [
        JSON.stringify([ref.projectionId, ref.stationId]),
        index,
      ]),
    );
    const partitions: (DeparturePartitionIdentity & {
      reuseIndex?: number;
    })[] = [];
    for (const [key, identity] of parts) {
      const reuseIndex = previousIndices.get(key);
      const prior =
        reuseIndex === undefined ? undefined : previousParts[reuseIndex];
      // Completion changes on a rebuild, even when its projection ID survives.
      // Issue/label changes can retain the same verified departure bytes.
      if (
        prior &&
        previous?.inputs.projectionDigests?.[identity.projectionId] ===
          projectionDigests[identity.projectionId]
      ) {
        try {
          await arrivalDepartureStore.read(prior);
          partitions.push({ ...identity, reuseIndex });
          continue;
        } catch {
          // Missing or corrupt bytes must be rebuilt, never certified as ready.
        }
      }
      partitions.push(identity);
    }
    const plan = {
      arrivalInputsSha256: arrivals.value.sha256,
      generation: arrivals.value.generation,
      attestation: arrivals.inputs.attestation,
      projections: indexed,
      projectionDigests,
      partitions: partitions.sort(
        (a, b) =>
          a.projectionId - b.projectionId ||
          (a.stationId < b.stationId ? -1 : a.stationId > b.stationId ? 1 : 0),
      ),
      expectedHeadBase64: head.raw.toString('base64'),
      previous: previousParts,
    };
    if (Buffer.byteLength(JSON.stringify(plan)) > MAX_PUBLICATION_PLAN_BYTES)
      throw new Error('Departure publication plan exceeds bounds');
    return plan;
  });
  const db = await getDefaultDb();
  async function withPublicationSnapshot<T>(
    indexed: Projection[],
    callback: (tx: AppDbTransaction) => Promise<T>,
  ) {
    const arrivals = await arrivalInputSnapshotStore.head();
    if (
      arrivals.value?.sha256 !== plan.arrivalInputsSha256 ||
      arrivals.value.generation !== plan.generation ||
      arrivals.value.fingerprint !== fingerprint
    )
      throw new Error('Arrival metadata changed during departure publication');
    return db.transaction(
      async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
        // Compilation is expensive for these one-off aggregates on small computes.
        await tx.execute(sql`SET LOCAL jit = off`);
        await assertPullWorkflowLease(tx, owner);
        const generation = await readCompletedPageProfileGeneration(tx);
        const { attestation } = await readCanonicalTopologyAttestation(tx);
        if (
          generation !== plan.generation ||
          JSON.stringify(attestation) !== JSON.stringify(plan.attestation)
        )
          throw new Error(
            'Canonical inputs changed during departure publication',
          );
        for (const projection of indexed) {
          if (!projection.completedAt)
            throw new Error('Departure projection incomplete');
          const [current] = await tx
            .select()
            .from(projections)
            .where(
              and(
                eq(projections.id, projection.id),
                eq(projections.manifest_sha256, projection.manifestSha256),
                eq(projections.projector_version, projection.projectorVersion),
                eq(projections.topology_sha256, projection.topologySha256),
                eq(
                  projections.topology_projection_version,
                  projection.topologyProjectionVersion,
                ),
                eq(projections.feed_start_date, projection.startDate),
                eq(projections.feed_end_date, projection.endDate),
                eq(
                  projections.maximum_departure_seconds,
                  projection.maximumDepartureSeconds,
                ),
                eq(projections.completed_at, projection.completedAt),
              ),
            );
          if (!current)
            throw new Error('Departure projection changed during publication');
        }
        return callback(tx);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  const refs: DeparturePartitionRef[] = [];
  const projectionsById = new Map(plan.projections.map((row) => [row.id, row]));
  let partitionBytes = 0;
  for (let i = 0; i < plan.partitions.length; i++) {
    const identity = plan.partitions[i];
    let ref =
      identity.reuseIndex === undefined
        ? undefined
        : plan.previous[identity.reuseIndex];
    if (!ref) {
      ref = await run(`publish-arrival-departure-${i}`, async () => {
        const projection = projectionsById.get(identity.projectionId);
        if (!projection)
          throw new Error('Departure projection missing from plan');
        const partition = await withPublicationSnapshot([projection], (tx) =>
          readDeparturePartition(tx, identity, projection.projectorVersion),
        );
        return arrivalDepartureStore.prepare(
          partition,
          MAX_DEPARTURE_TOTAL_BYTES - partitionBytes,
        );
      });
    }
    refs.push(ref);
    partitionBytes += ref.bytes;
    if (partitionBytes > MAX_DEPARTURE_TOTAL_BYTES)
      throw new Error('Departure publication exceeds total Redis limit');
  }
  return run('activate-arrival-departures', async () => {
    await withPublicationSnapshot(plan.projections, async () => {});
    const result = await arrivalDepartureStore.publish(
      Buffer.from(plan.expectedHeadBase64, 'base64'),
      {
        arrivalInputsSha256: plan.arrivalInputsSha256,
        projectionDigests: plan.projectionDigests,
        partitions: refs,
      },
      plan.generation,
      fingerprint,
      plan.previous,
    );
    console.info(
      JSON.stringify({
        event: 'arrival_departures_published',
        ...result,
        partitions: refs.length,
        partitionBytes,
      }),
    );
    return result;
  });
}
