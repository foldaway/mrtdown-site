import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { relations, schema } from './relations';

function createDb(database: D1Database) {
  return drizzle(database, { relations, schema });
}

export type AppDb = ReturnType<typeof createDb>;

export function getDb(): AppDb {
  const database = env.DB;
  if (!database) {
    throw new Error('Missing DB D1 binding');
  }
  return createDb(database);
}
