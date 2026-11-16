import { TranslationsSchema } from '@mrtdown/core';
import { z } from 'zod';
import { getRootData, ROOT_LAST_UPDATED_METADATA_KEY } from './dbQueries/root';
import {
  getNavigationCacheKey,
  getPageProfileRedis,
} from './pageProfileRedis.server';

const NavigationEntrySchema = z.object({
  generation: z.string().min(1),
  navigation: z.object({
    lineNavItems: z.array(
      z.object({ id: z.string(), color: z.string(), name: TranslationsSchema }),
    ),
    operatorNavItems: z.array(
      z.object({ id: z.string(), name: TranslationsSchema }),
    ),
    metadata: z
      .array(
        z.object({
          key: z.literal(ROOT_LAST_UPDATED_METADATA_KEY),
          value: z.iso.datetime(),
        }),
      )
      .length(1),
  }),
});

export function isNavigationCacheReadEnabled() {
  return process.env.REDIS_NAVIGATION_CACHE === 'enabled';
}

export function isNavigationCachePublicationEnabled() {
  return (
    process.env.REDIS_NAVIGATION_CACHE === 'publish' ||
    isNavigationCacheReadEnabled()
  );
}

export async function readNavigationCacheEntry() {
  const key = getNavigationCacheKey();
  const value = await (await getPageProfileRedis()).get(key);
  if (value == null) return null;
  return NavigationEntrySchema.parse(JSON.parse(value));
}

export async function readCachedNavigation() {
  return (await readNavigationCacheEntry())?.navigation ?? null;
}

export async function publishNavigationCache(generation: string) {
  const key = getNavigationCacheKey();
  const navigation = await getRootData();
  const entry = NavigationEntrySchema.parse({ generation, navigation });
  // Keep the last completed generation available throughout the next pull.
  await (await getPageProfileRedis()).set(key, JSON.stringify(entry));
  console.info('[CACHE] Published Navigation', { generation });
}
