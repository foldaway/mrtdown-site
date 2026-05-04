import 'dotenv/config';
import assert from 'node:assert';
import { defineConfig } from 'drizzle-kit';

const { DATABASE_URL } = process.env;
assert(
  DATABASE_URL != null,
  'DATABASE_URL must be set in environment variables',
);

export default defineConfig({
  out: './drizzle',
  schema: './app/db/schema.ts',
  dialect: 'postgresql',
  extensionsFilters: ['postgis'],
  dbCredentials: {
    url: DATABASE_URL,
  },
});
