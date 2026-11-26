import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { relations } from '../db/relations';
import { repairCommunitySignalCache } from '../util/communitySignalCache.server';
import { repairCrowdReportSources } from '../util/crowdReportSourceCache.server';
import { getPageProfileRedis } from '../util/pageProfileRedis.server';

if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
  throw Error('DATABASE_URL and REDIS_URL are required');
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await repairCommunitySignalCache(drizzle({ client: pool, relations }));
  await repairCrowdReportSources(drizzle({ client: pool, relations }));
  console.log('Published public community signals and report sources');
} finally {
  await pool.end();
  await getPageProfileRedis().then(
    (redis) => redis.disconnect(),
    () => {},
  );
}
