import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { nowSg } from './dbQueries/dateTime';
import { getIssueReadModel } from './dbQueries/issue';
import { getCachedIssueProfile } from './issueProfileCache.server';
import { ISSUE_PROFILE_FRESH_UNTIL_HEADER } from './publicResponseCache';
import { recordServerTiming } from './serverTiming';

const InputSchema = z.object({
  issueId: z.string(),
});

export const getIssueFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { issueId } = val.data;
    if (!process.env.REDIS_URL) return getIssueReadModel(issueId);

    const startedAt = performance.now();
    const { profile, expiresAt } = await getCachedIssueProfile(
      issueId,
      nowSg(),
    );
    const source = expiresAt != null ? 'redis' : 'sql';
    recordServerTiming(
      'issue_profile_load',
      performance.now() - startedAt,
      source,
    );
    if (process.env.TIER === 'staging') {
      setResponseHeader('X-MRTDown-Issue-Profile-Source', source);
    }
    if (expiresAt == null) {
      // A SQL response could finish after a newer generation purges the edge.
      setResponseHeader('Cache-Control', 'no-store');
    } else {
      setResponseHeader(ISSUE_PROFILE_FRESH_UNTIL_HEADER, String(expiresAt));
    }
    return profile;
  });
