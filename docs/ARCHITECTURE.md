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
