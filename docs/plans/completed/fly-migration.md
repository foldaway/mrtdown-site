# Fly.io Migration Plan

> Plan date: 2026-07-09
>
> Status: complete
>
> This plan was documented retroactively from the completed migration branch so
> its scope and decisions remain available to future maintainers.

## Context

`mrtdown-site` previously ran as a Cloudflare Worker. The deployment depended on
Wrangler configuration, Hyperdrive for Postgres access, Cloudflare Workflows
for durable data jobs, Worker cron triggers for recurring work, a native rate
limit binding, and the Worker Cache API for public HTML caching.

The application needed a conventional Node.js runtime with more predictable CPU
and memory characteristics for archive parsing, operational-fact rebuilds, and
SSR. The chosen target was a containerized TanStack Start server on Fly.io,
while retaining the existing Postgres/PostGIS read model and public route
surface.

Current source-of-truth references:

- `docs/ARCHITECTURE.md`
- `docs/DATA_PIPELINE.md`
- `docs/QUALITY.md`
- `fly.preview.toml`
- `fly.staging.toml`
- `fly.production.toml`

## Goals

- Run the TanStack Start application as a Node.js service on Fly.io.
- Replace Cloudflare-specific database, workflow, scheduling, and rate-limit
  integrations without changing the canonical read model.
- Preserve durable pull and public-holiday workflows on Upstash Workflow.
- Keep recurring pull, holiday, and crowd-report dispatch schedules
  reproducible through deployment-owned QStash provisioning.
- Preserve Sentry release/environment metadata and existing request
  instrumentation.
- Keep preview, staging, and production mapped to their existing long-lived
  branches.
- Remove obsolete Cloudflare runtime configuration and generated bindings.

## Non-Goals

- Do not redesign the public UI or route structure.
- Do not replace Postgres/PostGIS or change the canonical archive format.
- Do not redesign the staging-to-live promotion pipeline.
- Do not introduce per-PR preview environments.
- Do not restore public HTML caching as part of the runtime migration.
- Do not solve broader production-performance work tracked in
  `docs/plans/active/production-performance.md`.

## Phases

### Phase 1: Establish the Fly and Node Runtime

- Add separate Fly configuration for preview, staging, and production.
- Build the Vite/TanStack Start `dist` output into the deployment image.
- Serve the server bundle and client assets with `srvx`.
- Initialize the Node-compatible Sentry integration before the server starts.
- Add a lightweight `/healthz` endpoint for Fly health checks.

Exit criteria:

- Each environment has an explicit `fly.<environment>.toml`.
- The production image starts the Node server on Fly's configured internal
  port.
- Fly health checks receive a successful response without requiring database
  access.

Status: complete. The Docker image contains production dependencies,
`instrument.server.mjs`, and the `dist` build output. All three Fly
configurations use `/healthz` and keep at least one Machine running.

### Phase 2: Replace Cloudflare Runtime Services

- Replace Hyperdrive access with a bounded Node `pg` pool used by Drizzle.
- Read server configuration from `process.env` instead of Worker bindings.
- Replace the native Worker rate-limit binding with Redis and
  `rate-limiter-flexible`.
- Reuse the Redis connection across crowd-report requests.
- Add local Postgres/PostGIS and Valkey services for development.
- Remove Wrangler, Worker bindings, and generated Worker type declarations.

Exit criteria:

- Server reads and writes use `DATABASE_URL` directly.
- Crowd-report submissions use the distributed Redis limiter.
- No application code imports `cloudflare:workers`.
- Local development can use the database and Redis URLs from `.env.example`.

Status: complete. Database access is process-local through a bounded pool, the
crowd-report limiter shares an `ioredis` client, and Cloudflare configuration is
no longer part of the runtime.

### Phase 3: Migrate Durable and Scheduled Work

- Port the canonical pull and public-holiday workflows to Upstash Workflow.
- Serve named workflows through the TanStack workflow route.
- Keep authenticated internal task routes for manual workflow starts.
- Apply QStash flow control to reduce concurrent workflow execution.
- Provision recurring schedules with deterministic, environment-scoped IDs.
- Schedule canonical pulls and crowd-report dispatch every six hours and public
  holiday synchronization weekly.
- Forward the internal API bearer token only to the crowd-report dispatch
  endpoint and redact it from QStash logs.

Exit criteria:

- Pull and public-holiday workflows no longer depend on Cloudflare Workflow
  classes or bindings.
- Reapplying schedule configuration updates the three managed schedules without
  deleting unrelated schedules.
- Preview, staging, and production schedules cannot overwrite one another.
- Schedule configuration can be inspected without mutation through
  `npm run qstash:schedules:sync -- --dry-run`.

Status: complete. `.github/scripts/syncQstashSchedules.mjs` owns idempotent
schedule creation, and focused tests cover schedule IDs, destinations, flow
control, forwarded authorization, redaction, and API requests.

### Phase 4: Move Deployment Ownership to GitHub Actions

- Replace Wrangler deployments with `flyctl deploy`.
- Keep database migrations ahead of staging and production deployment jobs.
- Pass public build configuration and Sentry metadata as Docker build
  arguments/secrets.
- Run QStash schedule synchronization only after a successful Fly deployment.
- Source `QSTASH_URL`, `QSTASH_TOKEN`, and `INTERNAL_API_TOKEN` from each GitHub
  deployment environment.
- Queue a fresh preview pull after resetting and deploying the preview
  environment.

Exit criteria:

- `main`, `production`, and `preview` deploy to their documented Fly apps.
- A failed Fly deployment does not update external schedules.
- CI no longer requires Cloudflare API credentials or Wrangler deployment
  steps.

Status: complete. The branch-to-environment mapping remains unchanged while the
deployment provider and schedule ownership have moved to Fly and QStash.

### Phase 5: Retire Worker-Specific Behavior and Refresh Documentation

- Remove the Worker Cache API public HTML cache and its cache-specific tests.
- Keep public-route classification with Markdown request negotiation.
- Preserve historical Cloudflare context in dated investigations and completed
  plans while updating current architecture and operator documentation.
- Record current environment variables, local services, scripts, and deployment
  ownership.

Exit criteria:

- Current docs describe Fly.io, Node/`srvx`, direct Postgres access, Redis, and
  Upstash/QStash.
- Historical documents are clearly distinguishable from current operational
  guidance.
- The full repository verification suite passes.

Status: complete. Current documentation points to Fly and Upstash, while dated
Cloudflare investigations and progress entries remain intact as historical
evidence.

## Known Follow-Ups

- QStash `parallelism: 1` constrains workflow step delivery but does not provide
  a whole-workflow critical section. Two pull runs could still interleave
  between durable steps while sharing the `*_next` staging tables. Add an
  application-level lease or equivalent whole-run exclusion before treating
  concurrent manual and scheduled pulls as fully safe.
- Reassess whether public HTML needs an upstream cache after collecting Fly
  production timings; do not reintroduce caching without explicit invalidation
  and cache-status telemetry.

## Progress Log

- 2026-07-09: Selected Fly.io for the application runtime, direct Postgres for
  database access, Upstash Workflow/QStash for durable and scheduled work, and
  Redis for distributed short-window rate limiting.
- 2026-07-09: Defined the migration phases and environment mapping documented
  here. This entry was reconstructed retroactively from the completed branch.
- 2026-07-11: Completed the runtime, workflow, schedule, deployment, cache
  retirement, and documentation changes; rewrote the branch into coherent
  conventional commits.

## Decision Log

- 2026-07-09: Keep TanStack Start and package its Node server output rather than
  replacing the application framework during the hosting migration.
- 2026-07-09: Keep long-running orchestration outside Fly Machines by porting
  the existing durable workflows to Upstash Workflow.
- 2026-07-09: Manage QStash schedules from CI with deterministic IDs instead of
  relying on manual console configuration.
- 2026-07-09: Keep schedules environment-scoped and run provisioning only after
  a successful deployment.
- 2026-07-09: Retire the Worker Cache API implementation rather than introducing
  a new caching layer during the migration.
- 2026-07-09: Preserve completed plans and dated investigations as historical
  records; update the README and architecture/data-pipeline docs as the current
  source of truth.

## Validation

- Run `npm run verify` for typechecking, linting, formatting, migration drift,
  and tests.
- Run `npm run build` to verify the production client/server output.
- Parse `.github/workflows/deploy.yml` and
  `.github/workflows/deploy-preview.yml` as YAML.
- Run `npm run qstash:schedules:sync -- --dry-run` for each tier and confirm
  destinations, cron expressions, environment-scoped IDs, and secret redaction.
- Confirm the final migration tree contains no application imports from
  `cloudflare:workers` and no active Wrangler deployment configuration.
