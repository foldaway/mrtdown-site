import { TranslationsSchema } from '@mrtdown/core';
import { randomUUID } from 'node:crypto';
import { IngestContentCrowdReportEffectSchema } from '@mrtdown/ingest-contracts';
import { z } from 'zod';
import { lockCommunitySignalPublication } from './communitySignalCache.server';
import type { CrowdReportSourceKind } from './crowdReportSource';
import {
  getCrowdReportSource,
  readPublicCrowdReportSources,
} from './crowdReportSource.server';
import type { AppDb, AppDbTransaction } from './dbQueries/database';
import { getPageProfileRedis } from './pageProfileRedis.server';
import {
  createPublishedSnapshotStore,
  getSnapshotKeyPrefix,
} from './publishedSnapshotStore.server';
import { snapshotDigest } from './snapshotPayload.server';

const station = z.strictObject({
  id: z.string(),
  name: TranslationsSchema.strict(),
});
const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));
const source = z.strictObject({
  kind: z.enum(['cluster', 'report']),
  id: z.string(),
  status: z.enum(['pending', 'accepted', 'dispatched']),
  effect: IngestContentCrowdReportEffectSchema.nullable(),
  reportCount: z.number().int().positive(),
  observedStartAt: timestamp,
  observedEndAt: timestamp,
  updatedAt: timestamp,
  dispatchedAt: timestamp.nullable(),
  directionText: z.string().nullable(),
  directionStation: station.nullable(),
  delayMinutes: z.number().nullable(),
  stillHappening: z.boolean().nullable(),
  lines: z.array(station.extend({ color: z.string() })),
  stations: z.array(station),
});
const inputs = z
  .array(source)
  .max(10_000)
  .superRefine((rows, context) => {
    if (
      new Set(rows.map((row) => `${row.kind}:${row.id}`)).size !== rows.length
    )
      context.addIssue({ code: 'custom', message: 'Duplicate public source' });
  });
export const crowdReportSourceStore = createPublishedSnapshotStore(
  getPageProfileRedis,
  'community-report-sources',
  (value) => inputs.parse(value),
);
const headKey = () =>
  `${getSnapshotKeyPrefix('community-report-sources')}:active`;

/** Called at the end of owning transactions, after incident/reference work. */
export async function invalidateCrowdReportSources(tx: AppDbTransaction) {
  if (!process.env.REDIS_URL) return;
  await lockCommunitySignalPublication(tx);
  await (await getPageProfileRedis()).set(
    headKey(),
    JSON.stringify({ pending: randomUUID() }),
  );
}

export async function repairCrowdReportSources(
  db: AppDb,
  { onlyIfMissing = false } = {},
) {
  if (!process.env.REDIS_URL) return;
  await db.transaction(async (tx) => {
    await lockCommunitySignalPublication(tx);
    if (
      onlyIfMissing &&
      (await crowdReportSourceStore.read({ verifyPayload: true }))
    )
      return;
    // A fresh token plus the store's CAS fences delayed commands after SQL lock release.
    const identity = randomUUID();
    const expected = JSON.stringify({ pending: identity });
    await (await getPageProfileRedis()).set(headKey(), expected);
    const rows = await readPublicCrowdReportSources(tx);
    await crowdReportSourceStore.publish(
      expected,
      rows,
      identity,
      snapshotDigest(JSON.stringify(rows)),
    );
  });
}

export async function tryRepairCrowdReportSources(db: AppDb) {
  try {
    await repairCrowdReportSources(db, { onlyIfMissing: true });
  } catch (error) {
    // Post-commit publication cannot revoke an accepted write. Dirty state uses SQL.
    console.error('Community report source publication failed', { error });
  }
}

export async function getCachedCrowdReportSource(
  input: { kind: CrowdReportSourceKind; sourceId: string },
  getDb: () => AppDb,
) {
  if (process.env.REDIS_URL) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const published = await crowdReportSourceStore.readSelected(
        (rows) =>
          rows.find(
            (row) => row.kind === input.kind && row.id === input.sourceId,
          ) ?? null,
      );
      if (!published) break;
      try {
        // Certify both hits and authoritative misses after selecting/copying the payload.
        const current = await crowdReportSourceStore.head();
        if (current.raw.equals(published.raw)) return published.inputs;
      } catch {
        break;
      }
    }
  }
  return getDb().transaction((tx) => getCrowdReportSource(tx, input), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  });
}
