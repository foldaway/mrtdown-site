# mrtdown-site

Community-run transit monitoring for Singapore MRT/LRT disruptions.

`mrtdown-site` is a TanStack Start React app deployed to Fly.io. The Node server
reads canonical mrtdown data through a Postgres/PostGIS-backed read model
populated from data archives by durable Upstash Workflows.

## Local Development

Use Node.js 26 (`nvm use` reads the version from `.nvmrc`).

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Create local environment variables:

   ```sh
   cp .env.example .env
   ```

   The example points `VITE_ROOT_URL`, `DATABASE_URL`, and `REDIS_URL` at the
   local services. `QSTASH_DEV=true` enables the local QStash development
   server used by Upstash Workflow.

3. Start local Postgres/PostGIS and Valkey services, then run migrations and
   seed fixture data:

   ```sh
   docker compose up -d postgres valkey
   npm run db:migrate
   npm run db:seed:fixtures
   ```

4. Start the app:

   ```sh
   npm run dev
   ```

   Visit http://localhost:3000.

## Local workflows

- `npm run dev:pull` and `npm run dev:public-holidays` trigger the local
  workflows while the dev server is running.
- Run `npm run verify` before publishing. See the
  [quality guide](docs/development/quality.md) for database test setup and the
  [generated files guide](docs/development/generated-files.md) for migrations.

## Documentation

Use the [documentation index](docs/README.md) to find subject guides and the
[execution plan index](docs/plans/README.md) to find current work.

See the [repository working rules](AGENTS.md) before contributing.
