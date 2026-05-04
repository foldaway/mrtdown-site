import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export function getDb() {
  return drizzle(env.HYPERDRIVE.connectionString, { schema });
}
