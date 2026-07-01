# Read Query Decomposition Plan

## Context

The D1 migration exposed that the current read path still behaves like a
Postgres-era in-memory read model. Many route loaders enter through
`app/util/db.queries.ts`, which is a single large module that owns public page
queries, base dataset assembly, included-entity pruning, operational fact reads,
statistics snapshot access, sitemap/root navigation data, and workflow fact
rebuild helpers.

The most urgent performance issue is the `buildDataset`/`getBaseDataset` path.
Even after route payload pruning and statistics snapshots, cold or fallback
requests can still rebuild a broad base dataset by reading metadata, lines,
operators, towns, landmarks, stations, services, public holidays, all selected
issues, latest evidence, impact events, and impact-event details before a page
can respond. That shape was tolerable with Postgres plus process-local cache, but
it is expensive on D1 because each cold isolate has no warm in-memory cache and
D1 work is more sensitive to query count, result volume, and single-database
execution contention.

A direct preview timing probe was attempted on 2026-06-30 against
`https://mrtdown-site-preview.foldaway.workers.dev/`, but this container's
outbound HTTP proxy returned `403 Forbidden` before the request reached the
Worker. A browser timing sample from staging for
`https://staging.mrtdown.org/statistics` fills in the missing production signal:
the page downloaded in about 944 ms, with about 939 ms spent waiting. The
`Server-Timing` breakdown showed the Worker as the dominant cost (`cfWorker`
about 914 ms), while root navigation spans (`root_q_lines`, `root_q_operators`,
`root_q_metadata`, `root_nav_queries`, `root_data`, and `root_loader`) all sat
around 794 ms and the statistics snapshot path (`statistics_snapshot_query`,
`statistics_data`, and `statistics_loader`) sat around 819 ms. That means the
current D1 pain is not only the full base dataset fallback: even supposedly
small root and snapshot reads need to become cheaper and more predictable.
Future agents should still re-run timing probes from an environment that can
reach the preview URL and capture the `Server-Timing`, `X-MRTDown-Cache`, and
`X-MRTDown-Render` headers before and after each implementation phase.

Related source-of-truth docs and plans:

- `docs/plans/active/production-performance.md`
- `docs/plans/active/d1-migration.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_PIPELINE.md`
- `app/util/db.queries.ts`

## Goals

- Remove production route dependence on `getBaseDataset` and `buildDataset`.
- Reduce the staging `/statistics` Worker wait from the observed roughly 914 ms
  by making root navigation and statistics snapshot reads cheap on D1.
- Replace broad dataset assembly with route-shaped D1 queries that fetch only the
  rows each route renders.
- Keep route payloads explicit and small, preserving the included-entity pruning
  already completed in the production performance work.
- Split `app/util/db.queries.ts` into a query package with smaller files grouped
  by responsibility.
- Make read-path performance less dependent on process-local cache warmth.
- Preserve existing route return contracts until each caller is deliberately
  narrowed.

## Non-Goals

- This plan does not redesign page UI.
- This plan does not change canonical data ownership or pull-workflow staging.
- This plan does not remove statistics snapshots; it should lean on them more.
- This plan does not create hand-written Drizzle migrations.
- This plan does not introduce a long-lived second read API. A temporary
  compatibility barrel is acceptable only while imports are migrated.

## Current Pain Points

1. **One module owns too much.** `app/util/db.queries.ts` is difficult to review
   because route loaders, low-level mappers, statistics builders, fact rebuilds,
   and helper selectors live together.
2. **Base dataset is an implicit dependency.** Callers can appear small while
   indirectly requiring a large graph of lines, stations, services, issues,
   evidence, impact events, public holidays, and included entities.
3. **Process-local caching hides cost.** A five-minute in-memory base dataset
   cache can make one isolate look acceptable while cold isolates and D1 fallback
   paths stay slow.
4. **D1 rewards query shape discipline.** Fewer rows and route-specific indexes
   matter more than a broad batch of table scans followed by TypeScript joins.
5. **Root navigation is paid on every page.** The staging `/statistics` sample
   showed root navigation queries taking about 794 ms, so even a route with a
   statistics snapshot can wait on shared chrome data.
6. **Snapshot reads can still be too heavy.** The same sample showed
   `statistics_snapshot_query` at about 819 ms, which is too high for a single
   D1-backed precomputed payload fetch.
7. **Tests couple to the monolith.** Existing tests import and mock
   `./db.queries`, so large refactors can become noisy unless compatibility is
   planned.

## Target File Layout

Create `app/util/db/queries/` and migrate by responsibility. Keep
`app/util/db.queries.ts` as a temporary barrel that re-exports the public API so
callers can move incrementally.

Suggested layout:

```txt
app/util/db.queries.ts                 # temporary compatibility barrel
app/util/db/queries/index.ts           # canonical public exports
app/util/db/queries/types.ts           # exported read-model/page types
app/util/db/queries/shared.ts          # shared db access, chunks, dates, mappers
app/util/db/queries/included.ts        # included-entity selectors/builders
app/util/db/queries/issues.ts          # issue detail/card query helpers
app/util/db/queries/overview.ts        # getOverviewData and home helpers
app/util/db/queries/statistics.ts      # statistics snapshot reads/fallbacks
app/util/db/queries/history.ts         # history/day data
app/util/db/queries/lines.ts           # line profile/list queries
app/util/db/queries/stations.ts        # station profile/list queries
app/util/db/queries/operators.ts       # operator profile/list queries
app/util/db/queries/system-map.ts      # system map query surface
app/util/db/queries/sitemap.ts         # sitemap data
app/util/db/queries/root.ts            # root nav data
app/util/db/queries/facts.ts           # operational fact rebuild helpers
app/util/db/queries/baseDataset.ts     # legacy code kept only during migration
```

Rules for the new package:

- Route files and server functions should import from
  `~/util/db/queries/<area>` or the package index, not from deep legacy helpers.
- New route queries must not call `getBaseDataset` or `buildDataset`.
- The legacy `baseDataset.ts` file must have no new callers and should be
  deleted once all production paths are migrated.
- Fact rebuild/write helpers can live in the package during the split, but they
  should stay separate from public read queries.
- Keep type exports stable for route components while implementation files move.

## Current Base Dataset Callers

As of 2026-07-01, `buildDataset` and `getBaseDataset` are implementation-only
helpers in `app/util/db/queries/index.ts`. The remaining callers are:

- `buildBaseDataset`: cache wrapper for the legacy full dataset.
- `buildOverviewDataset`: overview/home candidate issue subset fallback.
- `getIncludedForIssueIds`: history fact-path included-entity hydration.
- `getLineProfileData`
- `getIssueData`
- `getStationProfileData`
- `getOperatorProfileData`
- `getHistoryYearSummaryData`: legacy fallback when fact coverage is missing.
- `getHistoryYearMonthData`: legacy fallback when fact coverage is missing.
- `getHistoryDayData`: legacy fallback when fact coverage is missing.
- `rebuildStatisticsSnapshot`: maintenance/workflow snapshot generation.
- `getStatisticsData`: legacy snapshot-included and missing-snapshot fallbacks.
- `getSitemapData`

## Phases

### Phase 0: Baseline And Guardrails

- Capture preview timings for `/`, `/statistics`, `/history`, `/lines`, one line
  profile, one station profile, one operator profile, `/system-map`, and
  `/about`.
- Record `Server-Timing`, `X-MRTDown-Cache`, `X-MRTDown-Render`, status, TTFB,
  and transfer size for cold-ish and repeated requests.
- Add or update tests that fail if production route query entry points call
  `getBaseDataset` after their phase is complete.
- Add a short comment or deprecation marker on `getBaseDataset` and
  `buildDataset` that says they are migration-only fallback paths.

Exit criteria:

- Baseline timings are captured from an environment that can reach the preview
  deployment.
- The repo has an explicit list of current `getBaseDataset`/`buildDataset`
  callers.
- Future work has a test or static check that prevents reintroducing base
  dataset use in migrated route files.

### Phase 1: Mechanical Query Package Split

- Create `app/util/db/queries/` and move pure types/helpers first.
- Move exported route query functions into area files without changing behavior.
- Keep `app/util/db.queries.ts` as a re-export barrel so existing imports and
  tests keep passing.
- Move tests only when it reduces coupling; otherwise keep compatibility tests
  until behavior changes land.

Exit criteria:

- `db.queries.ts` contains only exports and a removal note.
- No route behavior changes are included in this phase.
- `npm run verify` passes.

### Phase 2: Fix Shared Root Navigation Reads

- Move root navigation reads into `root.ts` and make them independently testable.
- Replace broad line/operator/metadata fetches with the smallest shape needed by
  the root layout.
- Check whether D1 is scanning because of missing indexes, large selected
  columns, serialized `Promise.all` execution, or result serialization.
- Consider persisting a tiny root navigation snapshot during the pull workflow if
  direct D1 reads remain close to the observed 794 ms staging sample.

Exit criteria:

- Root navigation no longer calls `getBaseDataset` or broad route helpers.
- Root navigation timing on `/statistics` is materially below the observed ~794
  ms sample, with a concrete target of under 150 ms for warm D1 reads.
- Root navigation timing is reported as a distinct `Server-Timing` span after the
  query package split.

### Phase 3: Replace Statistics And Snapshot Fallbacks

- Move statistics reads into `statistics.ts` and isolate snapshot lookup from any
  fallback builder.
- Make the statistics route require a current statistics snapshot in production.
- Keep any request-time statistics builder available only for local development
  or explicit maintenance/debug mode.
- Fetch the snapshot's already-pruned included entities directly and avoid base
  dataset assembly for normal statistics requests.
- Investigate why the staging sample shows `statistics_snapshot_query` at about
  819 ms for a precomputed payload: selected columns, JSON payload size, missing
  manifest/date index, D1 row decoding, and response serialization are all
  candidates.
- If one large snapshot JSON blob is the bottleneck, split the snapshot into
  summary, chart, longest-disruption, and included-entity sections so the route
  can stream or fetch only initially rendered data.
- Add observability when the route falls back, including a timing span and log
  field that makes fallback visible in preview/staging.

Exit criteria:

- Production `/statistics` never calls `getBaseDataset` under normal conditions.
- Missing or incompatible snapshots fail loudly in production instead of silently
  rebuilding the full dataset on the request path.
- `statistics_snapshot_query` is materially below the observed ~819 ms sample,
  with a concrete target of under 200 ms for warm D1 reads.
- Repeated and cold-ish `/statistics` preview timings stay within the production
  performance plan's goals.

### Phase 4: Replace Home And History Dataset Reads

- Convert home overview data to route-shaped queries over line/day facts,
  selected issue IDs, and minimal line/station dictionaries.
- Convert history day/range data to direct issue/fact queries that select only
  the requested dates and entity dependencies.
- Preserve the existing client-side viewport expansion behavior, but ensure the
  expansion fetch also avoids base dataset assembly.

Exit criteria:

- `/` and history routes do not call `getBaseDataset`.
- Home preview timing no longer depends on worker-isolate cache warmth.
- Route payloads remain at or below the sizes achieved by the previous included
  entity pruning work.

### Phase 5: Replace Entity Profile Queries

- Convert line, station, and operator profiles to direct D1 queries scoped by the
  requested entity ID and date window.
- Share small issue-card dependency helpers instead of loading a global issue
  graph.
- Confirm community signal and recent-issue lazy sections use the same scoped
  helpers.

Exit criteria:

- Line, station, and operator profile routes do not call `getBaseDataset`.
- Each profile route has focused tests for missing IDs, inactive entities, and
  issue-card dependency inclusion.
- Preview timings for representative profile routes are captured.

### Phase 6: Replace Remaining Public Reads

- Convert issue detail, system map, sitemap, and root navigation reads to direct
  scoped queries.
- Remove any last route/runtime dependency on base dataset mappers.
- Keep workflow fact rebuild helpers separate from route query helpers.

Exit criteria:

- No public route/server-function path calls `getBaseDataset` or `buildDataset`.
- Any remaining base dataset code is used only by tests or explicitly marked
  maintenance tooling.

### Phase 7: Delete Legacy Base Dataset

- Delete `baseDataset.ts`, `getBaseDataset`, `buildDataset`, and unused mappers.
- Remove the compatibility `app/util/db.queries.ts` barrel after all imports move
  to `~/util/db/queries`.
- Update architecture and data pipeline docs to describe route-shaped D1 reads.
- Update tests and mocks to import the new query modules directly.

Exit criteria:

- `rg "getBaseDataset|buildDataset|db\.queries" app docs` shows no production
  references, except historical plan notes if intentionally kept.
- `npm run verify` passes.
- Preview timing checks show no route regressed relative to Phase 0 baseline.

## Suggested Implementation Order

1. Land the mechanical package split with no behavior change.
2. Fix root navigation reads first because every public page pays that cost and
   the staging sample showed it near 794 ms.
3. Remove the statistics fallback from production and optimize the snapshot query
   because `/statistics` still showed an ~819 ms snapshot span.
4. Remove home/history base dataset usage because those routes are high-traffic
   and expose D1 cold-path pain.
5. Migrate entity profiles in one or more focused PRs.
6. Migrate smaller remaining read surfaces.
7. Delete the legacy base dataset and compatibility barrel.

## Validation

Run before each PR handoff:

- `npm run verify`
- Targeted tests for changed query modules, usually `npm run test:run -- <test>`
- Preview timing probe for any changed public route, recording headers and TTFB

Suggested timing probe from a network that can reach the preview deployment:

```sh
for path in / /statistics /history /about; do
  curl --compressed -sS -o /dev/null -w "${path} status=%{http_code} ttfb=%{time_starttransfer} total=%{time_total} size=%{size_download}\n" \
    -D "/tmp/mrtdown${path//\//_}.headers" \
    "https://mrtdown-site-preview.foldaway.workers.dev${path}"
  rg -i '^(server-timing|x-mrtdown-cache|x-mrtdown-render|cf-cache-status|cache-control):' \
    "/tmp/mrtdown${path//\//_}.headers"
done
```

## Progress Log

- 2026-07-01: Started Phase 1 by moving the existing `db.queries.ts`
  implementation intact to `app/util/db/queries/index.ts`, leaving
  `app/util/db.queries.ts` as a temporary compatibility barrel. Added
  migration-only comments to `buildDataset` and `getBaseDataset`, and recorded
  the current base-dataset caller list above.
- 2026-07-01: Started Phase 2 by moving `getRootData` to
  `app/util/db/queries/root.ts` and changing the root metadata read to fetch
  only `manifest_last_pulled_at`, which is the only metadata key currently used
  by the root layout.
- 2026-06-30: Drafted plan after identifying `buildDataset` as the broad base
  dataset assembly path and confirming this container cannot reach the preview
  deployment because the outbound proxy returns `403 Forbidden`.
- 2026-06-30: Incorporated staging `/statistics` browser timing data showing
  about 944 ms total download time, ~914 ms Worker time, ~794 ms root navigation
  spans, and an ~819 ms `statistics_snapshot_query`; adjusted the plan to fix
  root navigation and snapshot reads before less visible route migrations.

## Decision Log

- 2026-06-30: Prefer route-shaped D1 reads over adding a stronger distributed
  cache around the base dataset. Caching would hide cold-path latency but keep
  the expensive query shape and make correctness harder during data pulls.
- 2026-06-30: Keep a temporary compatibility barrel during the split so import
  churn does not block behavior-focused PRs.
