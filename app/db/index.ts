import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { relations } from './relations';

let db: NodePgDatabase<Record<string, never>, typeof relations>;

export function getDb() {
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    throw new Error('Missing DATABASE_URL');
  }
  if (db == null) {
    const pool = new Pool({
      max: 5,
      connectionString: DATABASE_URL,
    });
    pool.on('error', (error) => {
      console.error('Unexpected error from an idle Postgres client', error);
    });
    db = drizzle({ client: pool, relations });
  }
  return db;
}
