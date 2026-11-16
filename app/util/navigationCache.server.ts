import { TranslationsSchema } from '@mrtdown/core';
import Redis from 'ioredis';
import { z } from 'zod';
import { getRootData, ROOT_LAST_UPDATED_METADATA_KEY } from './dbQueries/root';

const REDIS_TIMEOUT_MS = 500;

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

let redis: Redis | undefined;
let connecting: Promise<void> | undefined;

export function isNavigationCacheReadEnabled() {
  return process.env.REDIS_NAVIGATION_CACHE === 'enabled';
}

export function isNavigationCachePublicationEnabled() {
  return (
    process.env.REDIS_NAVIGATION_CACHE === 'publish' ||
    isNavigationCacheReadEnabled()
  );
}

function navigationKey() {
  const tier = process.env.TIER ?? 'development';
  if (!/^[a-z0-9_-]+$/.test(tier)) {
    throw new Error('Invalid TIER for the Navigation cache');
  }
  return `mrtdown:${tier}:page-profiles:v1:navigation`;
}

async function getRedis() {
  if (redis == null || redis.status === 'end') {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL is required for the Navigation cache');
    const client = new Redis(url, {
      lazyConnect: true,
      connectTimeout: REDIS_TIMEOUT_MS,
      commandTimeout: REDIS_TIMEOUT_MS,
      enableOfflineQueue: false,
      enableReadyCheck: false,
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: 0,
    });
    redis = client;
    // Observe connection errors through the readiness and command promises.
    client.on('error', () => {});
    connecting = client.connect().finally(() => {
      connecting = undefined;
    });
  }
  if (redis.status !== 'ready') await connecting;
  return redis;
}

export async function readCachedNavigation() {
  const key = navigationKey();
  const value = await (await getRedis()).get(key);
  if (value == null) return null;
  return NavigationEntrySchema.parse(JSON.parse(value)).navigation;
}

export async function publishNavigationCache(generation: string) {
  const key = navigationKey();
  const navigation = await getRootData();
  const entry = NavigationEntrySchema.parse({ generation, navigation });
  // Keep the last completed generation available throughout the next pull.
  await (await getRedis()).set(key, JSON.stringify(entry));
  console.info('[CACHE] Published Navigation', { generation });
}
