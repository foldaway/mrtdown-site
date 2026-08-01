import { createHash } from 'node:crypto';
import type { Manifest } from '@mrtdown/core';
import { eq } from 'drizzle-orm';
import type { getDb } from '~/db';
import { metadataTable } from '~/db/schema';

type AppDb = ReturnType<typeof getDb>;

/**
 * Bump this when a pull-pipeline or derived-data change needs one full pull
 * even if the upstream manifest is unchanged.
 */
const PULL_PIPELINE_VERSION = 1;

const MANIFEST_FINGERPRINT_METADATA_KEY = `canonical_manifest_fingerprint_v${PULL_PIPELINE_VERSION}`;

function sortRecord(record: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

/**
 * Represents the canonical inputs that affect this application's read model.
 * `generatedAt` is deliberately excluded: it is publication metadata, not a
 * content change. Stable sorting prevents an upstream JSON key-order change
 * from triggering a full pull.
 */
export function getCanonicalManifestFingerprint(manifest: Manifest): string {
  const canonicalInput = {
    pipelineVersion: PULL_PIPELINE_VERSION,
    manifestVersion: manifest.manifestVersion,
    lines: sortRecord(manifest.lines),
    stations: sortRecord(manifest.stations),
    towns: sortRecord(manifest.towns),
    landmarks: sortRecord(manifest.landmarks),
    operators: sortRecord(manifest.operators),
    services: sortRecord(manifest.services),
    issues: sortRecord(manifest.issues),
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalInput))
    .digest('hex');
}

export async function isCanonicalManifestCurrent(
  db: AppDb,
  fingerprint: string,
): Promise<boolean> {
  const rows = await db
    .select({ value: metadataTable.value })
    .from(metadataTable)
    .where(eq(metadataTable.key, MANIFEST_FINGERPRINT_METADATA_KEY))
    .limit(1);
  return rows[0]?.value === fingerprint;
}

/**
 * Mark the canonical input current only after every pull side effect,
 * including cache publication, has completed successfully.
 */
export async function recordCanonicalManifestFingerprint(
  db: AppDb,
  fingerprint: string,
): Promise<void> {
  await db
    .insert(metadataTable)
    .values({ key: MANIFEST_FINGERPRINT_METADATA_KEY, value: fingerprint })
    .onConflictDoUpdate({
      target: [metadataTable.key],
      set: { value: fingerprint },
    });
}
