# Architecture

`mrtdown-site` is a TanStack Start React app deployed to Cloudflare Workers.

## Main Layers

- `app/routes`: file-based routes, route loaders, page metadata, and API routes.
- `app/util/*.functions.ts`: TanStack server functions used by loaders and client code.
- `app/util/db.queries.ts`: DB-backed read model queries used by server functions.
- `app/db`: Drizzle schema, enum helpers, and database connection setup.
- `app/workflows/pull`: Cloudflare Workflow code that stages and promotes canonical data.
- `app/components`: reusable UI and page-level components.

## Data Direction

Canonical mrtdown archive data is fetched by the pull workflow, staged in `*_next` tables, promoted into normalized live tables, and read by server functions through `app/util/db.queries.ts`.

The generated API client remains present for shared types and legacy boundaries during the overhaul. Treat new DB-backed query code as the direction of travel.
