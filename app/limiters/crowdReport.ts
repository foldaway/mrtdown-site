import Redis, { type RedisOptions } from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { assert } from '~/util/assert';

let redisClient: Redis;

export const CROWD_REPORT_REDIS_OPTIONS = {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
} satisfies RedisOptions;

function getRedisClient() {
  const { REDIS_URL } = process.env;
  assert(REDIS_URL != null, 'Expected REDIS_URL');
  return new Redis(REDIS_URL, CROWD_REPORT_REDIS_OPTIONS);
}

export function getCrowdReportRateLimiter() {
  if (redisClient == null) {
    redisClient = getRedisClient();
  }
  return new RateLimiterRedis({
    storeClient: redisClient,
    points: 5,
    duration: 60,
    keyPrefix: 'crowdReport',
  });
}
