import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { getDb } from './index';
import { metadataTable } from './schema';

// Absent until a complete promotion by this pipeline; failure cleanup must not restore it.
export const CANONICAL_TOPOLOGY_PROMOTION_KEY =
  'canonical_topology_promotion_complete_v1';
export const CANONICAL_TOPOLOGY_ATTESTATION_KEY =
  'canonical_topology_attestation_v1';
export const CANONICAL_TOPOLOGY_LAST_PULL_KEY = 'manifest_last_pulled_at';

export const CanonicalTopologyAttestationSchema = z.strictObject({
  encodingVersion: z.literal(1),
  projectionVersion: z.literal(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  promotionToken: z.uuid(),
  lastPulledAt: z.iso.datetime(),
});
/** Must be read through the transaction that owns topology and departures. */
export async function readCanonicalTopologyAttestation(
  tx: Pick<ReturnType<typeof getDb>, 'select'>,
) {
  const rows = await tx
    .select({ key: metadataTable.key, value: metadataTable.value })
    .from(metadataTable)
    .where(
      inArray(metadataTable.key, [
        CANONICAL_TOPOLOGY_PROMOTION_KEY,
        CANONICAL_TOPOLOGY_ATTESTATION_KEY,
        CANONICAL_TOPOLOGY_LAST_PULL_KEY,
      ]),
    );
  const values = new Map(rows.map(({ key, value }) => [key, value]));
  if (values.get(CANONICAL_TOPOLOGY_PROMOTION_KEY) !== '1') {
    throw new Error('Live canonical topology requires a completed promotion');
  }
  const raw = values.get(CANONICAL_TOPOLOGY_ATTESTATION_KEY);
  if (!raw) return { reason: 'attestation-missing' } as const;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { reason: 'attestation-invalid' } as const;
  }
  const parsed = CanonicalTopologyAttestationSchema.safeParse(value);
  if (!parsed.success) return { reason: 'attestation-invalid' } as const;
  if (
    parsed.data.lastPulledAt !== values.get(CANONICAL_TOPOLOGY_LAST_PULL_KEY)
  ) {
    return { reason: 'attestation-stale' } as const;
  }
  return { attestation: parsed.data } as const;
}
