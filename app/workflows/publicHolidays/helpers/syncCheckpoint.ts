import { createHash, randomUUID } from 'node:crypto';
import { getPageProfileRedis } from '~/util/pageProfileRedis.server';
import { getSnapshotKeyPrefix } from '~/util/publishedSnapshotStore.server';
import { rangeSnapshotStore } from '~/util/rangeSnapshotStore.server';
import type { PublicHolidaySyncRow } from './syncPublicHolidays';

const key = (suffix: string) =>
  `${getSnapshotKeyPrefix('range-snapshot')}:public-holidays:${suffix}`;

function sourceIdentity(rows: readonly PublicHolidaySyncRow[]) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        // Keep receipts compatible with the completed rollout's identity.
        publishRange: true,
        rows: [...rows].sort((a, b) => a.id.localeCompare(b.id)),
      }),
    )
    .digest('hex');
}

export async function canSkipPublicHolidaySync(
  rows: readonly PublicHolidaySyncRow[],
) {
  // An empty or unavailable source cannot establish that the database is current.
  if (!process.env.REDIS_URL || rows.length === 0) return false;
  try {
    const redis = await getPageProfileRedis();
    const token = await redis.getrange(key('writer'), 0, 100);
    const completed = await redis.getrange(key('completed'), 0, 200);
    if (!token || completed !== `${token}:${sourceIdentity(rows)}`)
      return false;
    return Boolean(await rangeSnapshotStore.read({ verifyPayload: true }));
  } catch {
    return false;
  }
}

/** Called under the SQL writer lease, before any holiday mutation. */
export async function beginPublicHolidaySync() {
  // Invalidate before mutation; only the current writer can certify completion.
  if (!process.env.REDIS_URL) return undefined;
  const token = randomUUID();
  const redis = await getPageProfileRedis();
  await redis.set(key('writer'), token);
  return token;
}

export async function assertPublicHolidaySyncToken(token: string | undefined) {
  if (!token && !process.env.REDIS_URL) return;
  const redis = await getPageProfileRedis();
  // A resumed workflow cannot certify a different writer's committed changes.
  // The SQL lease prevents another writer starting between this check and SET.
  if (!token || (await redis.getrange(key('writer'), 0, 100)) !== token)
    throw new Error('Holiday sync superseded; start a new workflow');
}

export async function completePublicHolidaySync(
  token: string | undefined,
  rows: readonly PublicHolidaySyncRow[],
) {
  if (!process.env.REDIS_URL) return;
  await assertPublicHolidaySyncToken(token);
  const redis = await getPageProfileRedis();
  await redis.set(key('completed'), `${token}:${sourceIdentity(rows)}`);
}
