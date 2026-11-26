import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { nowSg } from './dbQueries/dateTime';
import { getCachedIssueProfile } from './issueProfileCache.server';
import {
  ISSUE_PROFILE_FRESH_UNTIL_HEADER,
  ISSUE_PROFILE_PUBLICATION_HEADER,
} from './publicResponseCache';
import { recordServerTiming } from './serverTiming';

const InputSchema = z.object({
  issueId: z.string(),
});

export const getIssueFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { issueId } = val.data;

    const startedAt = performance.now();
    try {
      const { profile, expiresAt, source, publicationId } =
        await getCachedIssueProfile(issueId, nowSg());
      recordServerTiming(
        'issue_profile_load',
        performance.now() - startedAt,
        source,
      );
      if (process.env.TIER === 'staging') {
        setResponseHeader('X-MRTDown-Issue-Profile-Source', source);
      }
      if (expiresAt == null || publicationId == null) {
        // SQL recovery and clock-dependent durations must bypass shared caches.
        setResponseHeader('Cache-Control', 'no-store');
      } else {
        setResponseHeader(ISSUE_PROFILE_FRESH_UNTIL_HEADER, String(expiresAt));
        setResponseHeader(ISSUE_PROFILE_PUBLICATION_HEADER, publicationId);
      }
      return profile;
    } catch (error) {
      setResponseHeader('Cache-Control', 'no-store');
      throw error;
    }
  });
