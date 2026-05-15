import assert from 'node:assert';
import pg from 'pg';

const { Client } = pg;

const { ALLOW_DATABASE_RESET, DATABASE_URL } = process.env;

assert(
  DATABASE_URL != null && DATABASE_URL.length > 0,
  'DATABASE_URL must be set',
);
assert(
  ALLOW_DATABASE_RESET === 'true',
  'Refusing to reset database without ALLOW_DATABASE_RESET=true',
);

const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  await client.query('DROP EXTENSION IF EXISTS postgis CASCADE');
  await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO public');
  await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
  console.log('Database schema reset');
} finally {
  await client.end();
}
