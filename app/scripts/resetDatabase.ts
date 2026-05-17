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
  await client.query(`
    DO $$
    DECLARE
      item record;
    BEGIN
      FOR item IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname IN ('public', 'drizzle')
          AND tableowner = CURRENT_USER
      LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', item.schemaname, item.tablename);
      END LOOP;

      FOR item IN
        SELECT schemaname, viewname
        FROM pg_views
        WHERE schemaname IN ('public', 'drizzle')
          AND viewowner = CURRENT_USER
      LOOP
        EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', item.schemaname, item.viewname);
      END LOOP;

      FOR item IN
        SELECT schemaname, matviewname
        FROM pg_matviews
        WHERE schemaname IN ('public', 'drizzle')
          AND matviewowner = CURRENT_USER
      LOOP
        EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I.%I CASCADE', item.schemaname, item.matviewname);
      END LOOP;

      FOR item IN
        SELECT n.nspname AS schema_name, c.relname AS sequence_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('public', 'drizzle')
          AND c.relkind = 'S'
          AND pg_get_userbyid(c.relowner) = CURRENT_USER
      LOOP
        EXECUTE format('DROP SEQUENCE IF EXISTS %I.%I CASCADE', item.schema_name, item.sequence_name);
      END LOOP;

      FOR item IN
        SELECT n.nspname AS schema_name, t.typname AS type_name
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typtype = 'e'
          AND pg_get_userbyid(t.typowner) = CURRENT_USER
      LOOP
        EXECUTE format('DROP TYPE IF EXISTS %I.%I CASCADE', item.schema_name, item.type_name);
      END LOOP;

      IF EXISTS (
        SELECT 1
        FROM pg_namespace
        WHERE nspname = 'drizzle'
          AND pg_get_userbyid(nspowner) = CURRENT_USER
      ) THEN
        DROP SCHEMA drizzle CASCADE;
      END IF;
    END $$;
  `);
  console.log('Database schema reset');
} finally {
  await client.end();
}
