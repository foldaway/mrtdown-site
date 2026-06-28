# Cloudflare D1 Migration Plan

## Context

`mrtdown-site` currently uses a local Postgres/PostGIS-backed read model
deployed behind Cloudflare Hyperdrive. The database serves two separate roles:

- a rebuildable read model populated from canonical `mrtdown-data` archives;
- site-local writable state for public holidays, crowdsourced reports,
  moderation, clustering, rate limits, and dispatch back to `mrtdown-data`.

Moving to Cloudflare D1 should reduce monthly infrastructure cost. Treat this
as a direct infrastructure switch inside an isolated PR stack rather than a
long-lived dual-database architecture.

Source-of-truth references:

- `docs/ARCHITECTURE.md`
- `docs/DATA_PIPELINE.md`
- `docs/plans/completed/overhaul-read-model.md`
- `app/db/schema.ts`
- `app/db/index.ts`
- `app/workflows/pull`
- `app/util/db.queries.ts`
- `app/util/crowdReports.ts`
- `app/util/crowdReportDispatch.ts`
- Cloudflare D1 limits: `https://developers.cloudflare.com/d1/platform/limits/`
- Cloudflare D1 pricing:
  `https://developers.cloudflare.com/d1/platform/pricing/`
- Drizzle D1 connection guide:
  `https://orm.drizzle.team/docs/connect-cloudflare-d1`

## Current Postgres Responsibilities

- Store the normalized canonical read model for lines, stations, operators,
  towns, landmarks, services, service revisions, issues, evidence, impact
  events, public holidays, derived daily facts, and statistics snapshots.
- Persist pull-workflow staging tables (`*_next`) between Cloudflare Workflow
  steps so archive parsing does not need to carry large payloads in workflow
  state.
- Promote canonical archive changes by comparing manifest hashes, replacing
  changed child rows, deleting orphans, and rebuilding derived facts.
- Serve route loaders and server functions through `app/util/db.queries.ts`.
- Persist crowdsourced report submissions, abuse metadata, moderation events,
  duplicate detection, report clusters, dispatch status, and GitHub dispatch
  payloads.
- Provide Postgres-specific behavior currently used by the app:
  - Hyperdrive connection strings and `drizzle-orm/node-postgres`;
  - Drizzle `pg-core` schema declarations;
  - Postgres enums, `jsonb`, `timestamp with time zone`, `interval`, and
    PostGIS `geometry(point, 4326)`;
  - `TRUNCATE`, `now()`, `::int`, `::timestamptz`, enum casts, `least`,
    `greatest`, and `excluded.*` update expressions;
  - advisory locks for duplicate moderation and dispatch coordination.

## D1 Fit Assessment

The repo is a reasonable D1 candidate because most expensive domain behavior
already lives in TypeScript or rebuildable fact tables instead of advanced
Postgres queries. The current PostGIS usage is shallow: station coordinates are
stored as geometry, but runtime code only reads latitude and longitude with
`ST_Y` and `ST_X`.

The migration risk is concentrated in:

- SQL dialect changes across schema, migrations, staging promotion, public
  holiday sync, crowd reports, and dispatch;
- D1's bound-parameter limits, which require smaller write batches than the
  current Postgres-oriented `BATCH = 500`;
- D1's per-database single-threaded execution model;
- replacing Postgres advisory locks and transaction assumptions in
  crowdsourced report moderation and dispatch;
- preserving site-local mutable rows during cutover while rebuilding canonical
  rows from `mrtdown-data`.

## Goals

- Replace the current Postgres/Hyperdrive deployment with D1.
- Keep canonical transit data owned by `mrtdown-data`; D1 is only the local
  read model and site-local state store.
- Preserve the pull workflow's durable staging, hash-diff promotion, orphan
  cleanup, operational fact rebuild, and statistics snapshot rebuild behavior.
- Preserve crowdsourced report moderation, clustering, rate limiting, public
  signals, and dispatch back to `mrtdown-data`.
- Keep rollback practical by isolating the infrastructure switch in the PR stack
  and documenting how to revert the cutover.
- Ship as a stacked PR series where each PR is reviewable and has independent
  verification.

## Non-Goals

- This plan does not change canonical data ownership.
- This plan does not redesign the public UI.
- This plan does not make `mrtdown-site` the source of truth for schematic map
  data or crowdsourced reports once dispatched.
- This plan does not migrate unrelated hosting, routing, analytics, Sentry, or
  TanStack Start architecture.
- This plan does not maintain Postgres and D1 as long-lived parallel runtime
  options. The stack switches the app to D1.

## Branch And PR Stack

Use an umbrella branch as the review base for the migration stack:

- Umbrella branch: `codex/d1-migration`
- Umbrella PR title: `chore: prepare Cloudflare D1 migration`
- Umbrella PR purpose: keep the D1 infrastructure switch isolated from other
  work while each stack slice remains reviewable. It should not be merged until
  the stack is ready as a whole.

Stacked branches:

1. `codex/d1-migration-plan`
   - Base: current overhaul branch.
   - PR title: `docs: plan Cloudflare D1 migration`
   - Scope: this plan and plan-index updates only.
2. `codex/d1-migration-runtime`
   - Base: `codex/d1-migration-plan`.
   - PR title: `refactor: switch database runtime to D1`
   - Scope: replace the Hyperdrive/Postgres runtime entrypoint with D1-oriented
     database wiring.
3. `codex/d1-migration-sqlite-schema`
   - Base: previous stack branch.
   - PR title: `feat: add D1-compatible read model schema`
   - Scope: replace the Postgres schema/migration surface with SQLite/D1
     schema, migrations, type helpers, and local D1 config.
4. `codex/d1-migration-pull-workflow`
   - Base: previous stack branch.
   - PR title: `feat: port canonical pull workflow to D1`
   - Scope: D1 staging inserts, promotion, orphan cleanup, fact rebuilds, and
     statistics snapshot writes.
5. `codex/d1-migration-read-path`
   - Base: previous stack branch.
   - PR title: `feat: support D1-backed public reads`
   - Scope: route/server-function read queries, base dataset assembly, station
     coordinates, and statistics snapshot reads on D1.
6. `codex/d1-migration-crowd-reports`
   - Base: previous stack branch.
   - PR title: `feat: support D1-backed crowd reports`
   - Scope: report persistence, rate limits, moderation, duplicate detection,
     clustering, public signals, and dispatch state-machine changes.
7. `codex/d1-migration-cutover`
   - Base: previous stack branch.
   - PR title: `chore: cut over production data store to D1`
   - Scope: Wrangler bindings, deployment configuration, migration runbook,
     no-import site-local checks, and revert notes.

Each stacked PR should update this plan's progress log. Rebase stacked branches
forward after review changes so the final history reads as a deliberate
migration rather than a single high-risk diff.

## Phases

### Phase 0: Measurement And Inventory

- Measure current Postgres row counts and approximate table sizes.
- Capture route timings and pull-workflow timings before changing storage.
- Identify all raw SQL fragments that are Postgres-specific.
- Classify tables as rebuildable from `mrtdown-data`, derived from rebuildable
  data, or site-local mutable state.
- Record D1 limits relevant to this dataset, especially database size, query
  duration, bound parameters, and Worker-invocation query count.

Exit criteria:

- We know whether the canonical read model plus derived tables fit comfortably
  within D1 size limits.
- Every non-portable SQL feature has an owner phase.
- Site-local tables that need export/import are listed explicitly.

### Phase 1: D1 Runtime Foundation

- Replace the Hyperdrive/Postgres database entrypoint with D1-oriented wiring.
- Move shared type aliases away from `ReturnType<typeof getDb>` where needed so
  tests and migration code do not depend on the old Postgres driver shape.
- Update Wrangler bindings and environment types for D1.
- Add runtime-level tests or type checks for common `select`, `insert`,
  `transaction` or batch, and `execute` usage.

Exit criteria:

- The app compiles against the D1 database runtime shape.
- No route loader imports Hyperdrive or the Postgres driver directly.

### Phase 2: D1 Schema And Migrations

- Add a D1/SQLite schema equivalent for current tables.
- Replace Postgres-specific column types:
  - `jsonb` becomes JSON text with typed serialization helpers;
  - Postgres enums become text columns with TypeScript validation and optional
    SQLite checks;
  - `timestamp with time zone` and `date` become ISO text;
  - `interval` becomes duration seconds or ISO duration text;
  - station `geometry` becomes `latitude` and `longitude` numeric columns.
- Replace the current Drizzle Postgres migration checks with D1 migration
  generation and drift checks.
- Configure local, preview, staging, and production D1 bindings in the stack.

Exit criteria:

- A fresh local D1 database can be created from migrations.
- Schema tests prove the D1 tables can represent a representative canonical
  archive slice and representative crowd report rows.

### Phase 3: Canonical Pull Workflow On D1

- Port staging inserts to D1-safe batch sizes.
- Replace `TRUNCATE` with D1-compatible cleanup.
- Replace Postgres `excluded.*`, casts, date functions, and raw SQL fragments.
- Preserve step-level durable staging across Cloudflare Workflow steps.
- Rebuild operational facts and statistics snapshots on D1.
- Keep canonical data seeded by pulling from `mrtdown-data`, not by copying
  Postgres canonical tables.

Exit criteria:

- A local or preview D1 pull can ingest the canonical archive end-to-end.
- D1 row counts for canonical and derived tables match Postgres expectations.
- Re-running the pull is idempotent and handles changed hashes and orphan rows.

### Phase 4: Public Read Path On D1

- Run public route data reads against D1.
- Replace station coordinate reads that currently use `ST_Y` and `ST_X`.
- Compare outputs for key routes:
  - `/`
  - `/statistics`
  - `/history`
  - representative line, station, operator, and issue pages
  - `llms.txt` and Markdown routes
  - sitemap output
- Watch D1 query counts and row-read metrics so request-path reads stay within
  paid-plan limits and latency targets.

Exit criteria:

- Public routes render equivalent data from D1.
- Route timings are acceptable in preview.
- Any D1-specific fallback behavior is documented and tested.

### Phase 5: Crowd Reports And Dispatch

- Port report persistence, abuse events, rate limits, moderation events,
  duplicate detection, clusters, public signals, and dispatch state.
- Replace Postgres advisory locks with a D1-safe approach:
  - preferred: conditional status transitions plus short-lived lock rows; or
  - use a Durable Object for serialized moderation/dispatch coordination if D1
    lock rows are not enough.
- Avoid holding DB transaction assumptions across GitHub network dispatch.
  Prefer marking a candidate as dispatching, committing that state, calling
  GitHub, then conditionally marking success or failure.
- Preserve dispatch payload compatibility with `mrtdown-data` ingest contracts.

Exit criteria:

- Public report submission and automoderation work on D1.
- Duplicate and cluster behavior matches existing tests.
- Dispatch cannot send duplicate canonical ingest events under normal retries.
- Failure states are recoverable by a scheduled or manual dispatch run.

### Phase 6: Site-Local State Migration

- Do not import rows from Postgres during cutover.
- Rebuild public holidays through the D1 public-holiday workflow.
- Confirm old Postgres crowd-report tables are empty during the production
  freeze before enabling D1 traffic.
- If crowd-report rows exist before cutover, pause and decide whether they can
  be discarded, manually recreated through the D1-backed UI, or handled by a
  separate one-off migration.
- Rebuild canonical tables from `mrtdown-data` instead of importing them from
  Postgres.
- Run consistency checks after the canonical pull and public-holiday sync.

Exit criteria:

- D1 contains rebuilt canonical rows and refreshed public holidays.
- The no-import decision for old crowd-report state is explicitly validated.
- Canonical and derived rows can be rebuilt from the archive.
- A revert recovery path is documented.

### Phase 7: Preview And Cutover

- Deploy a preview environment backed by D1.
- Trigger pull, public holidays, facts, statistics, and crowd-report dispatch
  dry runs.
- Compare route data and timings against the Postgres-backed environment.
- Cut production bindings to D1 only after preview has passed.
- Keep the production cutover small: merge the stack, apply D1 migrations,
  run the canonical pull and public-holiday sync, validate no-import
  site-local checks, then deploy D1 bindings.
- Document how to revert the stack and restore the previous Postgres-backed
  deployment if cutover fails.

Exit criteria:

- `npm run verify` passes on the cutover branch.
- Production D1 pull succeeds.
- Production public routes serve correct data.
- Scheduled workflows complete on D1.
- A revert path is documented for the cutover.

## Progress Log

- 2026-06-22: Created the D1 migration plan and proposed an umbrella
  branch/stacked PR structure.
- 2026-06-22: Started Phase 1 on `codex/d1-migration-runtime` by replacing
  the runtime DB entrypoint with Drizzle D1 wiring, switching Wrangler bindings
  to `DB`, regenerating Worker environment types, and adding runtime-level DB
  binding tests.
- 2026-06-23: Continued Phase 2 by converting the Drizzle schema and migration
  generation surface to SQLite/D1, replacing PostGIS station points with
  latitude/longitude columns, replacing Postgres JSON/timestamp/enum/interval
  storage with D1-compatible columns, and generating a fresh SQLite baseline
  migration.
- 2026-06-25: Started Phase 3 on `codex/d1-migration-pull-workflow` by
  replacing remaining pull-workflow `excluded.*` and raw orphan-cleanup SQL with
  D1-safe Drizzle expressions, keeping staging cleanup on SQLite-compatible
  deletes, and renaming the staging cleanup entrypoint away from `truncate`.
- 2026-06-25: Verified that a fresh local D1 database applies all generated
  migrations. The local dev pull endpoint accepts workflow creation at
  `/internal/api/tasks/pull/`, but did not execute the workflow in the local
  runtime during validation; D1 row counts remained zero, so end-to-end pull
  validation still needs a preview or workflow-capable runtime.
- 2026-06-25: Started Phase 4 read-path hardening by making public statistics
  and fact-table fallbacks recognize D1/SQLite missing-table errors in addition
  to Postgres `42P01`, with focused coverage for D1-style wrapped errors.
- 2026-06-26: Extended Phase 4 sitemap read-path handling so a missing D1
  operational fact table keeps legacy-renderable history paths discoverable
  instead of treating the state like an existing empty facts table.
- 2026-06-27: Started Phase 5 dispatch hardening by moving crowd-report GitHub
  dispatch out of the DB transaction. Dispatch now claims affected report rows
  with a short-lived D1-compatible in-progress marker, commits that claim before
  the external `repository_dispatch` call, then marks success or failure in a
  separate transaction. Also replaced the public-holiday sync's raw
  `excluded.*` upsert fields with per-row bound update values.
- 2026-06-27: Started Phase 7 cutover enablement by replacing the deploy
  workflow D1 blockers with Wrangler D1 migration steps for preview, staging,
  and production. Preview deploys now apply migrations before build/deploy and
  then trigger the canonical pull workflow against the preview D1 database.
- 2026-06-27: Hardened Phase 7 cutover workflows after review by adding preview
  public-holiday sync before the preview canonical pull, and blocking
  production deploy until `D1_CUTOVER_READY=true` confirms no-import site-local
  checks, canonical pull, public-holiday sync, and route checks.
- 2026-06-27: Extended the D1 cutover readiness gate to staging so staging
  deploys cannot serve from a freshly migrated but unpopulated D1 database.
- 2026-06-27: Moved the staging readiness gate after the staging migration job
  so fresh D1 databases can still receive schema migrations before the Worker
  deploy is blocked pending population and route checks.
- 2026-06-27: Serialized the staging/production deploy workflow per branch so
  migrations and Worker deploys cannot overlap across consecutive workflow runs.
- 2026-06-28: Added a production build and Wrangler deploy dry-run preflight
  before production D1 migrations so schema changes do not apply ahead of a
  deployable Worker bundle.
- 2026-06-28: Removed the remaining direct Postgres maintenance scripts and
  direct `pg` dependencies after the D1 runtime and Wrangler migration commands
  became the only supported database entrypoints, and switched crowd-report SQL
  rendering tests to SQLite/D1 dialect coverage.
- 2026-06-28: Refined Phase 6 to avoid Postgres row imports during cutover.
  Canonical rows are rebuilt from `mrtdown-data`, public holidays are refreshed
  by the D1 workflow, and old Postgres crowd-report tables must be confirmed
  empty or explicitly dispositioned before `D1_CUTOVER_READY=true`.
- 2026-06-28: Hardened the manual D1 migration workflow so production manual
  migrations use the same build and Wrangler dry-run preflight as the
  production deploy workflow before applying remote schema changes.
- 2026-06-28: Added a preview D1 route smoke check after public-holiday sync
  and canonical pull workflow completion. The repeatable route timing script
  now covers representative public HTML, Markdown, and sitemap routes and fails
  CI when a probe returns an unexpected status or an empty successful body.
- 2026-06-28: Extended D1 route smoke checks to staging and production deploys
  so the live Worker URL is probed after the readiness gate and deploy
  complete.
- 2026-06-28: Added automated D1 readiness checks for preview, staging, and
  production deploys. The check queries remote D1 table counts for canonical
  rows, public holidays, line day facts, and statistics snapshots, prints
  Wrangler D1 query metrics, requires environment-specific `D1_MIN_*`
  thresholds, and fails deploy validation before route checks if the database
  is still empty or underpopulated.
- 2026-06-29: Tightened the D1 ordered-statement helper type so callers no
  longer derive the runner shape from Drizzle's interactive `transaction`
  callback API.
- 2026-06-29: Removed the D1 Wrangler config injection helper and workflow
  steps after deciding the real environment D1 database IDs will be filled into
  `wrangler.jsonc` before merging the cutover branch.
- 2026-06-29: Hardened the D1 route smoke checker so successful route probes
  must return the expected HTML, Markdown/plain-text, or XML content type
  instead of only checking status codes and non-empty response bodies.

## Decision Log

- 2026-06-22: Treat D1 as a storage and workflow migration, not a change in
  canonical data ownership. `mrtdown-data` remains the source of truth for
  transit data and the ingest destination for dispatched crowd reports.
- 2026-06-22: Use an umbrella branch/PR stack because the migration has several
  reviewable risk areas: D1 runtime, schema, canonical pull, public reads,
  crowd reports, and cutover.
- 2026-06-22: Keep the migration stack direct. The app should switch to D1
  rather than carry a long-lived Postgres/D1 compatibility layer.
- 2026-06-22: Rebuild canonical read-model rows from `mrtdown-data` during
  migration. Only site-local mutable rows need Postgres-to-D1 export/import.

## Validation

- Run `npm run verify` before handing work back or publishing changes.
- For each stack branch, run the narrowest relevant checks while iterating, then
  run full verification before review.
- For D1-specific branches, also validate:
  - fresh local D1 migration;
  - full canonical pull into D1;
  - route-output comparison against Postgres for representative pages;
  - crowd-report submission, moderation, clustering, and dispatch dry run;
  - D1 query metrics for rows read, rows written, duration, and query count.
