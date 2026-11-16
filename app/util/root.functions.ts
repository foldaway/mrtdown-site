import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import z from 'zod';
import { getRootData } from './dbQueries/root';
import { getLocaleMessages } from './localeMessages';
import {
  isNavigationCacheReadEnabled,
  readCachedNavigation,
} from './navigationCache.server';
import { timeServerSpan } from './serverTiming';

const InputSchema = z.object({
  lang: z.string().optional().default('en-SG'),
});

async function getNavigation() {
  if (!isNavigationCacheReadEnabled()) return getRootData();

  const cached = await timeServerSpan('navigation_redis', () =>
    readCachedNavigation().catch(() => null),
  );
  if (process.env.TIER === 'staging') {
    setResponseHeader('X-MRTDown-Navigation-Source', cached ? 'redis' : 'sql');
  }
  if (cached) return cached;

  // A fallback can observe live tables during promotion. Keep it off the edge.
  setResponseHeader('Cache-Control', 'no-store');
  return getRootData();
}

export const getRootFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { lang } = val.data;
    const [navigation, messages] = await Promise.all([
      timeServerSpan('root_loader', getNavigation),
      timeServerSpan('root_messages', () => getLocaleMessages(lang), lang),
    ]);
    return { ...navigation, messages };
  });
