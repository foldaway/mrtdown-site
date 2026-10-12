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

## Report Routes

Report URLs reserve a frequency segment for future monthly or annual reports:

- `/reports/weekly`: weekly archive.
- `/reports/weekly/YYYY-MM-DD`: a weekly report, identified by its Monday in
  Singapore time.
- `/reports`: temporarily redirects to `/reports/weekly` with HTTP 302 while
  weekly reports are the only format. Header and footer links continue to use
  `/reports` as the stable entry point.

Locale-prefixed routes follow the same structure and preserve the language on
redirect. Legacy `/weekly` URLs redirect permanently (301) to their equivalents
under `/reports/weekly`.

When a second format ships, replace the temporary redirect in
`app/routes/{-$lang}/reports/index.tsx` with a reports index, restore its localized
metadata and collection JSON-LD, and add `/reports` back to the sitemap. Future
monthly reports should use `/reports/monthly/YYYY-MM`. Only destination pages
are currently listed in the sitemap; current-week reports are unavailable until the week ends at Monday 00:00 SGT.

Weekly digest takeaways are deterministic and capped at two. Recorded service
suspensions take priority over weekday peak-hour overlap (07:00–09:00 and
17:00–19:00 SGT), then network reach. A second takeaway can identify separate
incidents in three consecutive weeks or a line returning after at least three
weeks with no recorded disruptions in the four-week lookback. The recurrence
rule requires distinct incident IDs; one ongoing incident is not treated as
repeated breakdowns. These statements describe the records, not passenger delay,
causes, or proof that service was flawless between incidents. Future advisories
are not mixed into these historical, long-cached reports.
