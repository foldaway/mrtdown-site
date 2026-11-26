import { readCanonicalTopologyAttestation } from '~/db/canonicalTopologyPromotion';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { readCanonicalManifestFingerprint } from '~/workflows/pull/helpers/manifestFingerprint';
import { getDefaultDb } from './dbQueries/database';
import {
  parseReportReferenceInputs,
  readCrowdReportFormOptionRows,
} from './dbQueries/reportReferenceInputs';
import { getPageProfileRedis } from './pageProfileRedis.server';
import { createPublishedSnapshotStore } from './publishedSnapshotStore.server';

export const reportReferenceSnapshotStore = createPublishedSnapshotStore(
  getPageProfileRedis,
  'report-references',
  parseReportReferenceInputs,
);

/** Publish only coherent completed canonical inputs, never request-time refills. */
export async function publishReportReferenceSnapshot(fingerprint?: string) {
  if (!process.env.REDIS_URL) return;
  const expected = await reportReferenceSnapshotStore.head();
  const db = await getDefaultDb();
  const snapshot = await db.transaction(
    async (tx) => {
      const generation = await readCompletedPageProfileGeneration(tx);
      const identity =
        fingerprint ?? (await readCanonicalManifestFingerprint(tx));
      if (!generation || !identity)
        throw new Error('Report references require completed canonical inputs');
      const { attestation } = await readCanonicalTopologyAttestation(tx);
      if (!attestation)
        throw new Error(
          'Report references require an attested canonical promotion',
        );
      const rows = await readCrowdReportFormOptionRows(tx);
      return {
        generation,
        fingerprint: identity,
        inputs: {
          datasetVersion: attestation.lastPulledAt,
          formOptionRows: {
            ...rows,
            serviceRevisions: rows.serviceRevisions.map((row) => ({
              ...row,
              updated_at: row.updated_at.toISOString(),
            })),
          },
        },
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const result = await reportReferenceSnapshotStore.publish(
    expected.raw,
    snapshot.inputs,
    snapshot.generation,
    snapshot.fingerprint,
  );
  console.info(
    JSON.stringify({ event: 'report_references_published', ...result }),
  );
  return result;
}
