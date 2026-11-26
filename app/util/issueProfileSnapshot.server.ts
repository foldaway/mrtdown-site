import { asc, desc } from 'drizzle-orm';
import { z } from 'zod';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import {
  evidencesTable,
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
} from '~/db/schema';
import { readCanonicalManifestFingerprint } from '~/workflows/pull/helpers/manifestFingerprint';
import { getDefaultDb } from './dbQueries/database';
import { readDatasetInputs } from './dbQueries/dataset';
import { toIssueUpdate } from './dbQueries/issueEvidence';
import {
  IssueProfileTopologySchema,
  parseIssueProfilePartition,
  selectIssueProfilePartition,
} from './dbQueries/issueProfileSnapshotInputs';
import { readRangeReferenceRows } from './dbQueries/rangeReferences';
import { getPageProfileRedis } from './pageProfileRedis.server';
import {
  createPublishedSnapshotStore,
  type SnapshotRedis,
} from './publishedSnapshotStore.server';
import {
  createSnapshotPartitions,
  type PartitionRedis,
} from './snapshotPartitions.server';

const MAX_ISSUES = 10_000;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const PARTITION_LIMITS = {
  encodedBytes: 512 * 1024,
  jsonBytes: 2 * 1024 * 1024,
};
const ManifestSchema = z.object({
  topology: IssueProfileTopologySchema,
  partitions: z
    .array(
      z.object({
        issueId: z.string().min(1).max(256),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        bytes: z.number().int().positive().max(PARTITION_LIMITS.encodedBytes),
      }),
    )
    .max(MAX_ISSUES),
});
function parseManifest(value: unknown) {
  const manifest = ManifestSchema.parse(value);
  if (
    new Set(manifest.partitions.map((ref) => ref.issueId)).size !==
    manifest.partitions.length
  )
    throw new Error('Duplicate Issue Profile partition');
  if (
    manifest.partitions.reduce((total, ref) => total + ref.bytes, 0) >
    MAX_TOTAL_BYTES
  )
    throw new Error('Issue Profiles exceed total Redis limit');
  return manifest;
}

export function createIssueProfileSnapshotStore(
  connect: () => Promise<SnapshotRedis & PartitionRedis>,
) {
  const manifest = createPublishedSnapshotStore(
    connect,
    'issue-profiles',
    parseManifest,
  );
  const parts = createSnapshotPartitions(
    connect,
    'issue-profiles',
    parseIssueProfilePartition,
    PARTITION_LIMITS,
  );
  type Snapshot = NonNullable<Awaited<ReturnType<typeof manifest.read>>>;
  async function readPartition(ref: Snapshot['inputs']['partitions'][number]) {
    const part = await parts.read(ref);
    if (part.issueId !== ref.issueId)
      throw new Error('Issue partition identity mismatch');
    return part;
  }
  async function read(issueId: string) {
    try {
      const snapshot = await manifest.read();
      const ref = snapshot?.inputs.partitions.find(
        (ref) => ref.issueId === issueId,
      );
      // Absence is not a negative cache: a newer canonical ID may already exist.
      if (!snapshot || !ref) return null;
      return { snapshot, part: await readPartition(ref) };
    } catch {
      return null;
    }
  }
  async function healthy() {
    const snapshot = await manifest.read({ verifyPayload: true });
    if (!snapshot) return null;
    try {
      // An unchanged pull must repair corrupt parts as well as evicted parts.
      // Bound concurrent commands while validating every required public input.
      for (let i = 0; i < snapshot.inputs.partitions.length; i += 16)
        await Promise.all(
          snapshot.inputs.partitions.slice(i, i + 16).map(readPartition),
        );
      return (await parts.ready(
        snapshot.raw,
        snapshot.inputs.partitions.map((ref) => ref.sha256),
      ))
        ? snapshot
        : null;
    } catch {
      return null;
    }
  }
  return { manifest, parts, read, healthy };
}
export const issueProfileSnapshotStore =
  createIssueProfileSnapshotStore(getPageProfileRedis);

/** Called under the canonical writer lease, after the generation is complete. */
export async function publishIssueProfileSnapshot(fingerprint?: string) {
  if (!process.env.REDIS_URL) return;
  const expected = await issueProfileSnapshotStore.manifest.head();
  const previous = await issueProfileSnapshotStore.manifest.read({
    verifyPayload: true,
  });
  const db = await getDefaultDb();
  const source = await db.transaction(
    async (tx) => {
      const generation = await readCompletedPageProfileGeneration(tx);
      const identity =
        fingerprint ?? (await readCanonicalManifestFingerprint(tx));
      if (!generation || !identity)
        throw new Error('Issue Profiles require completed canonical inputs');
      const references = await readRangeReferenceRows(tx);
      const [dataset, evidences, services, facilities] = await Promise.all([
        readDatasetInputs(tx, undefined, undefined, { references }),
        // Only the public update projection leaves this transaction. In particular,
        // redacted render translations and unused source fields are never published.
        tx
          .select({
            issueId: evidencesTable.issue_id,
            type: evidencesTable.type,
            text: evidencesTable.text,
            render: evidencesTable.render,
            source_url: evidencesTable.source_url,
            ts: evidencesTable.ts,
          })
          .from(evidencesTable)
          .orderBy(desc(evidencesTable.ts), asc(evidencesTable.id)),
        tx.select().from(impactEventEntityServicesTable),
        tx.select().from(impactEventEntityFacilitiesTable),
      ]);
      if (dataset.issueRows.length > MAX_ISSUES)
        throw new Error('Too many Issue Profiles');
      const updates = new Map<string, ReturnType<typeof toIssueUpdate>[]>();
      for (const row of evidences) {
        const list = updates.get(row.issueId) ?? [];
        list.push(toIssueUpdate(row));
        updates.set(row.issueId, list);
      }
      return {
        generation,
        fingerprint: identity,
        dataset,
        updates,
        references: {
          impactEventServiceRows: services,
          impactEventFacilityRows: facilities,
        },
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const partitions = [];
  let bytes = 0;
  for (const issue of source.dataset.issueRows) {
    const part = selectIssueProfilePartition(
      source.dataset,
      issue.id,
      source.references,
      source.updates.get(issue.id) ?? [],
    );
    const ref = await issueProfileSnapshotStore.parts.prepare(
      part,
      MAX_TOTAL_BYTES - bytes,
    );
    partitions.push({ issueId: issue.id, ...ref });
    bytes += ref.bytes;
  }
  const result = await issueProfileSnapshotStore.manifest.publish(
    expected.raw,
    {
      // Scoped Issue Profile SQL omits holidays and detail-entity bodies.
      topology: IssueProfileTopologySchema.parse({
        ...source.dataset,
        publicHolidayRows: [],
      }),
      partitions,
    },
    source.generation,
    source.fingerprint,
    {
      active: partitions.map((ref) => ref.sha256),
      previous: previous?.inputs.partitions.map((ref) => ref.sha256) ?? [],
    },
  );
  console.info(
    JSON.stringify({
      event: 'issue_profiles_published',
      ...result,
      issues: partitions.length,
      partitionBytes: bytes,
      largestPartitionBytes: Math.max(0, ...partitions.map((ref) => ref.bytes)),
    }),
  );
  return { ...result, issues: partitions.length, partitionBytes: bytes };
}
