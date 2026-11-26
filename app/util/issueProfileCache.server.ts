import type { DateTime } from 'luxon';
import { getDefaultDb } from './dbQueries/database';
import { getIssueReadModel } from './dbQueries/issue';
import { assembleIssueProfileSnapshot } from './dbQueries/issueProfileSnapshotInputs';
import { issueProfileSnapshotStore } from './issueProfileSnapshot.server';

export async function getCachedIssueProfile(
  issueId: string,
  referenceNow: DateTime,
) {
  const published = process.env.REDIS_URL
    ? await issueProfileSnapshotStore.read(issueId)
    : null;
  if (published) {
    const profile = assembleIssueProfileSnapshot(
      published.snapshot.inputs.topology,
      published.part,
      referenceNow,
    );
    const intervals = profile.included.issues[issueId].intervals;
    // Keep the existing completed-only edge policy. Ongoing durations change
    // with every request; future/recurring intervals must not freeze at the edge.
    const completed =
      intervals.length > 0 &&
      intervals.every((interval) => interval.status === 'ended');
    return {
      profile,
      source: 'redis' as const,
      expiresAt: completed
        ? referenceNow.plus({ days: 1 }).startOf('day').toMillis()
        : undefined,
    };
  }
  const db = await getDefaultDb();
  const profile = await db.transaction(
    (tx) => getIssueReadModel(issueId, referenceNow, tx),
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  return { profile, source: 'sql' as const };
}
