# Architecture

`mrtdown-site` is a TanStack Start React app running as a containerized Node.js
service on Fly.io. `srvx` serves the TanStack Start server bundle and static
client assets.

## Main Layers

- `app/routes`: file-based routes, route loaders, page metadata, and API routes.
- `app/server.ts`: server entry, request instrumentation, sitemap handling, and
  Markdown request negotiation.
- `app/util/*.functions.ts`: TanStack server functions used by loaders and
  client code.
- `app/util/dbQueries`: layered DB-backed read-model assembly, domain
  calculations, maintenance tasks, and feature queries used by server
  functions and workflows.
- `app/types.ts`: source-owned domain and response shapes returned by server
  functions.
- `app/db`: Drizzle schema, enum helpers, and database connection setup.
- `app/workflows`: Upstash Workflow definitions for canonical pulls and public
  holiday synchronization.
- `app/limiters`: Redis-backed distributed request limiters.
- `app/components`: reusable UI and page-level components.

## Data Direction

Canonical mrtdown archive data is fetched by the pull workflow, staged in
`*_next` tables, promoted into normalized live tables, and read by server
functions through the modules under `app/util/dbQueries`.

QStash invokes the public workflow endpoint under
`/internal/api/workflows/$workflowName`. Authenticated internal task routes can
also start workflows manually. Deployment workflows idempotently provision the
recurring QStash schedules after a successful Fly deployment.

The application connects directly to Postgres through a bounded `pg` pool.
Crowd-report submissions use a shared Redis limiter before the database-backed
abuse checks run.

The generated API client has been retired. Server functions are backed by the
local read model rather than the old remote MRTDown API client.

`app/types.ts` is intentionally a temporary read-model boundary. Keep shrinking
it by using canonical `@mrtdown/core` types directly and by letting query-local
response shapes be inferred where they do not need to cross module boundaries.
The end state is to remove the legacy extracted type surface entirely.

## Deployment Branch Mapping

Deploy workflows are branch-driven and map branches to environments as follows:

- `production` branch -> `production` environment (`.github/workflows/deploy.yml`)
- `main` branch -> `staging` environment (`.github/workflows/deploy.yml`)
- `preview` branch -> `preview` environment (`.github/workflows/deploy-preview.yml`)

This mapping is intentional so environment state is tied to a single long-lived
branch rather than per-PR preview deploys.

Each environment uses its own `fly.<environment>.toml`. GitHub deployment
environments provide the Fly deployment token, migration database URL, Sentry
build credentials, QStash credentials, and internal API token. Runtime values
such as `DATABASE_URL`, `REDIS_URL`, `SENTRY_DSN`,
`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, and other signing keys
are configured on the corresponding Fly app. Both QStash signing keys are
required outside local `QSTASH_DEV` mode so public workflow requests are
verified. The deployed image contains only production dependencies and the
`dist` client/server build output.
