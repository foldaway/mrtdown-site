import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/node-postgres';
import { relations } from './relations';

export function getDb() {
  const connectionString = env.HYPERDRIVE?.connectionString;
  if (!connectionString) {
    throw new Error('Missing HYPERDRIVE binding/connectionString');
  }
  return drizzle(connectionString, { relations });
}
