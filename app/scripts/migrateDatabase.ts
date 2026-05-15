import assert from 'node:assert';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import pg from 'pg';

const { Client } = pg;

const { DATABASE_URL } = process.env;

assert(
  DATABASE_URL != null && DATABASE_URL.length > 0,
  'DATABASE_URL must be set',
);

const migrations = readMigrationFiles({ migrationsFolder: 'drizzle' });
const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const lastMigrationResult = await client.query<{
    created_at: string | number;
  }>(
    'SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1',
  );
  const lastMigration = lastMigrationResult.rows[0];
  const lastMigrationCreatedAt =
    lastMigration == null ? null : Number(lastMigration.created_at);
  const pendingMigrations = migrations.filter(
    (migration) =>
      lastMigrationCreatedAt == null ||
      lastMigrationCreatedAt < migration.folderMillis,
  );

  console.log(
    `Applying ${pendingMigrations.length} pending database migration(s)`,
  );

  await client.query('BEGIN');
  for (const migration of pendingMigrations) {
    console.log(`Applying migration ${migration.folderMillis}`);
    for (const [index, statement] of migration.sql.entries()) {
      try {
        await client.query(statement);
      } catch (error) {
        console.error(
          `Migration ${migration.folderMillis} statement ${index + 1} failed`,
        );
        console.error(statement);
        throw error;
      }
    }
    await client.query(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
      [migration.hash, migration.folderMillis],
    );
  }
  await client.query('COMMIT');

  console.log('Database migrations complete');
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Ignore rollback errors so the original migration error remains visible.
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
