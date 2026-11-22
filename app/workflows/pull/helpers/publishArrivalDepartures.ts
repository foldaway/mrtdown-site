import { and, eq, sql } from 'drizzle-orm';
import { readCanonicalTopologyAttestation } from '~/db/canonicalTopologyPromotion';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { scheduledDepartureProjectionsTable as projections } from '~/db/scheduledDepartures.schema';
import {
  arrivalDepartureStore,
  isArrivalDeparturePublicationEnabled,
  MAX_DEPARTURE_PARTITIONS,
  MAX_DEPARTURE_TOTAL_BYTES,
  type DeparturePartitionRef,
} from '~/util/arrivalDepartureStore.server';
import {
  arrivalInputSnapshotStore,
  isArrivalInputPublicationEnabled,
} from '~/util/arrivalInputSnapshot.server';
import type { ArrivalInputs } from '~/util/dbQueries/arrivalInputs';
import { getDefaultDb } from '~/util/dbQueries/database';
import { readDeparturePartition } from '~/util/dbQueries/readDeparturePartition';
import { assertPullWorkflowLease } from './workflowLease';

type RunStep = <T>(name: string, callback: () => Promise<T>) => Promise<T>;
type Projection = ArrivalInputs['projections'][number];

/** Step results contain only identities and hashes, never departure payloads. */
export async function publishArrivalDepartures(
  run: RunStep,
  owner: string,
  fingerprint: string,
) {
  if (!isArrivalDeparturePublicationEnabled()) return;
  if (!isArrivalInputPublicationEnabled())
    throw new Error(
      'Departure publication requires arrival metadata publication',
    );
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
    const parts = new Map<
      string,
      { projectionId: number; stationId: string }
    >();
    for (const scope of arrivals.inputs.scopes) {
      if (indexed.some((row) => row.id === scope.projection_id)) {
        const part = {
          projectionId: scope.projection_id,
          stationId: scope.station_id,
        };
        parts.set(JSON.stringify([part.projectionId, part.stationId]), part);
      }
    }
    const plan = {
      arrivalInputsSha256: arrivals.value.sha256,
      generation: arrivals.value.generation,
      attestation: arrivals.inputs.attestation,
      projections: indexed,
      partitions: [...parts.values()].sort(
        (a, b) =>
          a.projectionId - b.projectionId ||
          (a.stationId < b.stationId ? -1 : a.stationId > b.stationId ? 1 : 0),
      ),
      expectedHeadBase64: head.raw.toString('base64'),
      previous: previous?.inputs.partitions ?? [],
    };
    if (
      parts.size > MAX_DEPARTURE_PARTITIONS ||
      Buffer.byteLength(JSON.stringify(plan)) > 256 * 1024
    )
      throw new Error('Departure publication plan exceeds bounds');
    return plan;
  });
  const db = await getDefaultDb();
  async function capture<T>(
    indexed: Projection[],
    callback: (
      tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    ) => Promise<T>,
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
  for (let i = 0; i < plan.partitions.length; i++) {
    const identity = plan.partitions[i];
    const ref = await run(`publish-arrival-departure-${i}`, async () => {
      const projection = plan.projections.find(
        (row) => row.id === identity.projectionId,
      );
      if (!projection)
        throw new Error('Departure projection missing from plan');
      const partition = await capture([projection], (tx) =>
        readDeparturePartition(tx, identity, projection.projectorVersion),
      );
      return arrivalDepartureStore.prepare(
        partition,
        MAX_DEPARTURE_TOTAL_BYTES -
          refs.reduce((sum, part) => sum + part.bytes, 0),
      );
    });
    refs.push(ref);
    if (
      refs.reduce((sum, part) => sum + part.bytes, 0) >
      MAX_DEPARTURE_TOTAL_BYTES
    )
      throw new Error('Departure publication exceeds total Redis limit');
  }
  return run('activate-arrival-departures', async () => {
    await capture(plan.projections, async () => {});
    const result = await arrivalDepartureStore.publish(
      Buffer.from(plan.expectedHeadBase64, 'base64'),
      { arrivalInputsSha256: plan.arrivalInputsSha256, partitions: refs },
      plan.generation,
      fingerprint,
      plan.previous,
    );
    console.info(
      JSON.stringify({
        event: 'arrival_departures_published',
        ...result,
        partitions: refs.length,
        partitionBytes: refs.reduce((sum, ref) => sum + ref.bytes, 0),
      }),
    );
    return result;
  });
}
