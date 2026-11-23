import { createHash, randomUUID } from 'node:crypto';
import { getPageProfileRedis } from '~/util/pageProfileRedis.server';
import { getSnapshotKeyPrefix } from '~/util/publishedSnapshotStore.server';
import {
  isRangeSnapshotPublicationEnabled,
  rangeSnapshotStore,
} from '~/util/rangeSnapshotStore.server';
import type { PublicHolidaySyncRow } from './syncPublicHolidays';

const key = (suffix: string) =>
  `${getSnapshotKeyPrefix('range-snapshot')}:public-holidays:${suffix}`;

export function isPublicHolidayPreflightEnabled() {
  return process.env.REDIS_PUBLIC_HOLIDAY_PREFLIGHT === 'enabled';
}

function sourceIdentity(rows: readonly PublicHolidaySyncRow[]) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        publishRange: isRangeSnapshotPublicationEnabled(),
        rows: [...rows].sort((a, b) => a.id.localeCompare(b.id)),
      }),
    )
    .digest('hex');
}

export async function canSkipPublicHolidaySync(
  rows: readonly PublicHolidaySyncRow[],
) {
  // An empty or unavailable source cannot establish that the database is current.
  if (!isPublicHolidayPreflightEnabled() || rows.length === 0) return false;
  try {
    const redis = await getPageProfileRedis();
    const token = await redis.getrange(key('writer'), 0, 100);
    const completed = await redis.getrange(key('completed'), 0, 200);
    if (!token || completed !== `${token}:${sourceIdentity(rows)}`)
      return false;
    return (
      !isRangeSnapshotPublicationEnabled() ||
      Boolean(await rangeSnapshotStore.read({ verifyPayload: true }))
    );
  } catch {
    return false;
  }
}

/** Called under the SQL writer lease, before any holiday mutation. */
export async function beginPublicHolidaySync() {
  // Writers keep invalidating while reads are disabled, so rollback/re-enable
  // cannot revive a checkpoint from before an intervening write.
  if (!process.env.REDIS_URL && !isPublicHolidayPreflightEnabled())
    return undefined;
  const token = randomUUID();
  const redis = await getPageProfileRedis();
  await redis.set(key('writer'), token);
  return token;
}

export async function assertPublicHolidaySyncToken(token: string | undefined) {
  if (!token && !isPublicHolidayPreflightEnabled()) return;
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
  if (!isPublicHolidayPreflightEnabled()) return;
  await assertPublicHolidaySyncToken(token);
  const redis = await getPageProfileRedis();
  await redis.set(key('completed'), `${token}:${sourceIdentity(rows)}`);
}
