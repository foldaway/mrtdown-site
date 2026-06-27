# Architecture

`mrtdown-site` is a TanStack Start React app deployed to Cloudflare Workers.

## Main Layers

- `app/routes`: file-based routes, route loaders, page metadata, and API routes.
- `app/util/*.functions.ts`: TanStack server functions used by loaders and client code.
- `app/util/db.queries.ts`: DB-backed read model queries used by server functions.
- `app/types.ts`: source-owned domain and response shapes returned by server functions.
- `app/db`: Drizzle schema, enum helpers, and database connection setup.
- `app/workflows/pull`: Cloudflare Workflow code that stages and promotes canonical data.
- `app/components`: reusable UI and page-level components.
- Cloudflare D1 is the runtime database. Drizzle owns the SQLite schema and
  generated migrations; Wrangler applies mirrored SQL migrations from
  `migrations/**`.

## Data Direction

Canonical mrtdown archive data is fetched by the pull workflow, staged in `*_next` tables, promoted into normalized live tables, and read by server functions through `app/util/db.queries.ts`.

The generated API client has been retired. Server functions are backed by the local read model rather than the old remote MRTDown API client.

`app/types.ts` is intentionally a temporary read-model boundary. Keep shrinking it by using canonical `@mrtdown/core` types directly and by letting query-local response shapes be inferred where they do not need to cross module boundaries. The end state is to remove the legacy extracted type surface entirely.

## Deployment Branch Mapping

Deploy workflows are branch-driven and map branches to environments as follows:

- `production` branch -> `production` environment (`.github/workflows/deploy.yml`)
- `main` branch -> `staging` environment (`.github/workflows/deploy.yml`)
- `preview` branch -> `preview` environment (`.github/workflows/deploy-preview.yml`)

This mapping is intentional so environment state is tied to a single long-lived branch rather than per-PR preview deploys.

Each deployed environment applies pending D1 migrations before the Worker is
deployed. CI keeps placeholder D1 IDs in the checked-in Wrangler config and
injects the real environment ID from the `D1_DATABASE_ID` GitHub environment
variable before remote Wrangler commands run.

The preview workflow also triggers the public-holidays workflow and then the
canonical pull workflow after deployment so the preview D1 read model can be
validated before staging or production cutover. Staging and production deploys
require `D1_CUTOVER_READY=true` in the matching GitHub environment. Set it only
after the canonical pull, public-holiday sync, and route checks have passed
against that environment's D1 database; for production, also import site-local
state before enabling the gate.

The staging/production deploy workflow is serialized per branch so D1
migrations and Worker deploys advance together. A newer run waits for the
previous run to finish instead of applying newer migrations while an older
Worker deploy is still in progress.

Production additionally builds the Worker and runs a Wrangler deploy dry run
before applying D1 migrations. This keeps production schema changes behind a
successful environment-specific deploy preflight.
