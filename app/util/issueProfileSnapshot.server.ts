import { asc, desc } from 'drizzle-orm';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { evidencesTable } from '~/db/schema';
import { readCanonicalManifestFingerprint } from '~/workflows/pull/helpers/manifestFingerprint';
import { getDefaultDb } from './dbQueries/database';
import { readDatasetInputs } from './dbQueries/dataset';
import { toIssueUpdate } from './dbQueries/issueEvidence';
import { parseIssueProfileSnapshotInputs } from './dbQueries/issueProfileSnapshotInputs';
import { readRangeReferenceRows } from './dbQueries/rangeReferences';
import { getPageProfileRedis } from './pageProfileRedis.server';
import { createPublishedSnapshotStore } from './publishedSnapshotStore.server';

export const issueProfileSnapshotStore = createPublishedSnapshotStore(
  getPageProfileRedis,
  'issue-profiles',
  parseIssueProfileSnapshotInputs,
);

/** Called under the canonical writer lease, after the generation is complete. */
export async function publishIssueProfileSnapshot(fingerprint?: string) {
  if (!process.env.REDIS_URL) return;
  const expected = await issueProfileSnapshotStore.head();
  const db = await getDefaultDb();
  const source = await db.transaction(
    async (tx) => {
      const generation = await readCompletedPageProfileGeneration(tx);
      const identity =
        fingerprint ?? (await readCanonicalManifestFingerprint(tx));
      if (!generation || !identity)
        throw new Error('Issue Profiles require completed canonical inputs');
      const references = await readRangeReferenceRows(tx);
      const [dataset, evidences] = await Promise.all([
        readDatasetInputs(tx, undefined, undefined, {
          references,
          includeHistoricalIssueReferences: true,
        }),
        tx
          .select()
          .from(evidencesTable)
          .orderBy(desc(evidencesTable.ts), asc(evidencesTable.id)),
      ]);
      const updates = new Map<string, ReturnType<typeof toIssueUpdate>[]>();
      for (const row of evidences) {
        const list = updates.get(row.issue_id) ?? [];
        list.push(toIssueUpdate(row));
        updates.set(row.issue_id, list);
      }
      return {
        generation,
        fingerprint: identity,
        inputs: {
          // Match scoped SQL and exclude unused metadata and redacted source fields.
          dataset: {
            ...dataset,
            publicHolidayRows: [],
            issueRows: dataset.issueRows.map((row) => ({
              ...row,
              title_meta: null,
            })),
          },
          updates: Object.fromEntries(
            dataset.issueRows.map(({ id }) => [id, updates.get(id) ?? []]),
          ),
        },
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const result = await issueProfileSnapshotStore.publish(
    expected.raw,
    parseIssueProfileSnapshotInputs(source.inputs),
    source.generation,
    source.fingerprint,
  );
  console.info(
    JSON.stringify({
      event: 'issue_profiles_published',
      ...result,
      issues: source.inputs.dataset.issueRows.length,
    }),
  );
  return result;
}
