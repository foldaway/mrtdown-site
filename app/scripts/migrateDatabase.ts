import assert from 'node:assert';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const { Client } = pg;

const { DATABASE_URL } = process.env;

assert(
  DATABASE_URL != null && DATABASE_URL.length > 0,
  'DATABASE_URL must be set',
);

const client = new Client({ connectionString: DATABASE_URL });
const db = drizzle({ client });
const MIGRATION_LOCK_ID = 612348731;

try {
  await client.connect();
  await db.execute(sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`);

  console.log('Applying pending database migrations');
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('Database migrations complete');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await db.execute(sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`);
  } catch {
    // Ignore unlock errors so the original migration error remains visible.
  }

  await client.end();
}
