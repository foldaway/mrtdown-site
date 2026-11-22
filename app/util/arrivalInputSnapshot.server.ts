import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { readCanonicalManifestFingerprint } from '~/workflows/pull/helpers/manifestFingerprint';
import { parseArrivalInputs } from './dbQueries/arrivalInputs';
import { getDefaultDb } from './dbQueries/database';
import { readArrivalInputs } from './dbQueries/readArrivalInputs';
import { getPageProfileRedis } from './pageProfileRedis.server';
import { createPublishedSnapshotStore } from './publishedSnapshotStore.server';

export const arrivalInputSnapshotStore = createPublishedSnapshotStore(
  getPageProfileRedis,
  'arrival-inputs',
  parseArrivalInputs,
);

export function isArrivalInputPublicationEnabled() {
  return process.env.REDIS_ARRIVAL_SNAPSHOT === 'publish';
}

export async function publishArrivalInputSnapshot(fingerprint?: string) {
  if (!isArrivalInputPublicationEnabled()) return;
  const expected = await arrivalInputSnapshotStore.head();
  const db = await getDefaultDb();
  const snapshot = await db.transaction(
    async (tx) => {
      const generation = await readCompletedPageProfileGeneration(tx);
      const identity =
        fingerprint ?? (await readCanonicalManifestFingerprint(tx));
      if (!generation || !identity)
        throw new Error('Arrival inputs require completed canonical inputs');
      return {
        generation,
        fingerprint: identity,
        inputs: await readArrivalInputs(tx),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const result = await arrivalInputSnapshotStore.publish(
    expected.raw,
    snapshot.inputs,
    snapshot.generation,
    snapshot.fingerprint,
  );
  console.info(
    JSON.stringify({
      event: 'arrival_inputs_published',
      ...result,
      scopes: snapshot.inputs.scopes.length,
      days: snapshot.inputs.days.length,
    }),
  );
  return result;
}
