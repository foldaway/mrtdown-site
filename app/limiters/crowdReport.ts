import Redis from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { assert } from '~/util/assert';

let redisClient: Redis;

function getRedisClient() {
  const { REDIS_URL } = process.env;
  assert(REDIS_URL != null, 'Expected REDIS_URL');
  return new Redis(REDIS_URL);
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
