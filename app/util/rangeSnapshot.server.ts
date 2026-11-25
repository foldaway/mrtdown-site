import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { readCanonicalManifestFingerprint } from '~/workflows/pull/helpers/manifestFingerprint';
import { getDefaultDb } from './dbQueries/database';
import { readDatasetInputs } from './dbQueries/dataset';
import { readRangeReferenceRows } from './dbQueries/rangeReferences';
import { rangeSnapshotStore } from './rangeSnapshotStore.server';

/** Publish completed canonical inputs; CAS also orders independent holiday writers. */
export async function publishRangeSnapshot(fingerprint?: string) {
  if (!process.env.REDIS_URL) return;
  const expected = await rangeSnapshotStore.head();
  const db = await getDefaultDb();
  const snapshot = await db.transaction(
    async (tx) => {
      const generation = await readCompletedPageProfileGeneration(tx);
      const identity =
        fingerprint ?? (await readCanonicalManifestFingerprint(tx));
      if (!generation || !identity)
        throw new Error('Range snapshot requires completed canonical inputs');
      const references = await readRangeReferenceRows(tx);
      const inputs = await readDatasetInputs(tx, undefined, undefined, {
        references,
      });
      return { generation, fingerprint: identity, inputs };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const result = await rangeSnapshotStore.publish(
    expected.raw,
    snapshot.inputs,
    snapshot.generation,
    snapshot.fingerprint,
  );
  console.info(
    JSON.stringify({ event: 'range_snapshot_published', ...result }),
  );
  return result;
}
