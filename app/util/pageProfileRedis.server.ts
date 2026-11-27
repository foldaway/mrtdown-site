import Redis from 'ioredis';

const REDIS_CONNECT_TIMEOUT_MS = 500;
// Large snapshot reads share the event loop with decoding and page rendering.
const REDIS_COMMAND_TIMEOUT_MS = 1_500;

let redis: Redis | undefined;
let connecting: Promise<void> | undefined;

export function getNavigationCacheKey() {
  const tier = process.env.TIER ?? 'development';
  if (!/^[a-z0-9_-]+$/.test(tier)) {
    throw new Error('Invalid TIER for the public page profile cache');
  }
  return `mrtdown:${tier}:page-profiles:v1:navigation`;
}

export async function getPageProfileRedis() {
  if (redis == null || redis.status === 'end') {
    const url = process.env.REDIS_URL;
    if (!url)
      throw new Error('REDIS_URL is required for the page profile cache');
    const client = new Redis(url, {
      lazyConnect: true,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
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
