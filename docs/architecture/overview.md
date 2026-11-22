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

- `production` branch -> `production` environment ([deploy-production.yml](../../.github/workflows/deploy-production.yml))
- `main` branch -> `staging` environment (`.github/workflows/deploy.yml`)
- `preview` branch -> `preview` environment (`.github/workflows/deploy-preview.yml`)

This mapping is intentional so environment state is tied to a single long-lived
branch rather than per-PR preview deploys.

Production callers share the reusable
[production deployment](../../.github/workflows/production-deployment.yml),
which migrates the database, deploys the supplied commit SHA, and syncs QStash
schedules. Pushes to `production` deploy the pushed SHA. To promote `main`, run
[Rebase and deploy production](../../.github/workflows/rebase-production.yml)
manually with `main` selected. It fetches the latest branches, rebases
`production` onto `main`, and pushes with an explicit force-with-lease before
calling the same deployment workflow. Rebase conflicts or concurrent branch
updates fail the run before deployment; resolve the branch state and retry.

Both callers serialize the entire production release without cancelling a run
in progress. Each migration and deployment checks that its SHA is still the
production branch tip, so a queued stale release fails before that operation.
The rebase uses `GITHUB_TOKEN`, so its push does not start a second
push-triggered deployment. The manual caller deploys the resulting SHA directly,
including when the rebase leaves `production` unchanged. GitHub branch rules
must allow the workflow token to update (and, for divergent history, force-push)
`production`. The production environment must allow deployments from `main` for
the manual caller, as well as from `production` for the push caller.

Each environment uses its own `fly.<environment>.toml`. GitHub deployment
environments provide the Fly deployment token, migration database URL, Sentry
build credentials, QStash credentials, and internal API token. Runtime values
such as `DATABASE_URL`, `REDIS_URL`, `SENTRY_DSN`,
and signing keys are configured on the corresponding Fly app. See
[scheduled jobs](data-pipeline.md#scheduled-jobs) for QStash configuration.

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

[Weekly report takeaways](../../app/util/weeklyReport.insights.ts) summarize
recorded disruptions and exclude future advisories. A recurring disruption
requires distinct incidents. The digest cannot establish passenger delay,
causation, or service quality between recorded events.
