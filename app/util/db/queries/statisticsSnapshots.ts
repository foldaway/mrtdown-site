import { eq } from 'drizzle-orm';
import type { AppDb } from '~/db';
import { statisticsSnapshotsTable } from '~/db/schema';
import { timeServerSpan } from '~/util/serverTiming';
import { getDefaultDb, isMissingTableError } from './shared';
import { parseStatisticsSnapshotPayload } from './statisticsPayload';

export const STATISTICS_SNAPSHOT_ID = 'latest';

export type StatisticsSnapshotDb = Pick<AppDb, 'select'>;

export async function getLatestStatisticsSnapshot(db?: StatisticsSnapshotDb) {
  const database = db ?? (await getDefaultDb());
  return getLatestStatisticsSnapshotFromDb(database);
}

export async function getLatestStatisticsSnapshotFromDb(
  db: StatisticsSnapshotDb,
) {
  try {
    const [snapshot] = await timeServerSpan('statistics_snapshot_query', () =>
      db
        .select({
          data: statisticsSnapshotsTable.data,
        })
        .from(statisticsSnapshotsTable)
        .where(eq(statisticsSnapshotsTable.id, STATISTICS_SNAPSHOT_ID))
        .limit(1),
    );
    return parseStatisticsSnapshotPayload(snapshot?.data);
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}
