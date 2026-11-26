import type { DateTime } from 'luxon';
import { getDefaultDb } from './dbQueries/database';
import { getIssueReadModel } from './dbQueries/issue';
import { assembleIssueProfileSnapshot } from './dbQueries/issueProfileSnapshotInputs';
import { issueProfileSnapshotStore } from './issueProfileSnapshot.server';
import {
  ISSUE_PROFILE_FRESH_UNTIL_HEADER,
  ISSUE_PROFILE_PUBLICATION_HEADER,
} from './publicResponseCache';

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
      publicationId: published.snapshot.value.publicationId,
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
  return { profile, source: 'sql' as const, publicationId: undefined };
}

/** Withdraw shared caching if publication advanced while rendering. */
export async function revalidateIssueProfileResponse(response: Response) {
  const publicationId = response.headers.get(ISSUE_PROFILE_PUBLICATION_HEADER);
  if (!response.headers.has(ISSUE_PROFILE_FRESH_UNTIL_HEADER) && !publicationId)
    return response;
  let current = false;
  try {
    current =
      publicationId != null &&
      (await issueProfileSnapshotStore.manifest.head()).value?.publicationId ===
        publicationId;
  } catch {
    // Unavailable Redis cannot certify that this response is still current.
  }
  const headers = new Headers(response.headers);
  headers.delete(ISSUE_PROFILE_PUBLICATION_HEADER);
  // Reuse the normal expired-deadline handling to strip all shared-cache headers.
  if (!current) headers.set(ISSUE_PROFILE_FRESH_UNTIL_HEADER, '0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
