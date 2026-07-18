# Scoped Public Read Model Plan

## Context

On 2026-07-18, production Neon `pg_stat_statements` showed the unfiltered
`impact_events` query running roughly once every few seconds. Each call returns
11,456 rows and is part of the complete `buildDataset()` query batch. The
application's complete JSON-equivalent dataset is about 6 MB, despite most
public routes rendering one entity or a bounded date range.

The cause is architectural rather than an inefficient query plan:
`getCompleteDataset()` constructs the full network and issue graph on the request
path, then public feature functions filter it in memory. The same connection
role and SQL shape are shared across callers, so Postgres cannot identify the
originating URL. The candidate public callers are nevertheless explicit in the
codebase.

Cloudflare caching remains an important immediate shield. Commit `931f828`
marks public TanStack server-function responses and `/api/issues-day` with
origin cache headers, but cache misses must no longer require a complete
dataset read.

Related plan: [Production performance](production-performance.md).

## Goals

- Keep complete-dataset construction for deliberate bulk and maintenance work.
- Remove complete-dataset construction from normal public request paths.
- Preserve current public route semantics, locale data, and response shapes
  while reducing database rows read and bytes transferred.
- Make the request path observable enough to associate future database work
  with a route or feature.
- Verify the production reduction using Neon statement counters and edge-cache
  behaviour.

## Non-Goals

- Do not replace the Postgres read model or canonical pull workflow.
- Do not use a shared cache of the complete 6 MB object as the final public
  read-model design; that only moves the overfetch to another service.
- Do not require a schema migration unless profiling shows a scoped query needs
  a missing index or persisted projection.

## Current Call Map

| Data function | Public entry points | Required scope |
| --- | --- | --- |
| `getIssueReadModel` | `/issues/:issueId`, issue Markdown | One issue, its events, evidence, and referenced entities |
| `getLineProfileReadModel` | `/lines/:lineId`, line Markdown | One line, its services/stations, and issues affecting that line in the requested window |
| `getStationProfileReadModel` | `/stations/:stationId`, station Markdown | One station, memberships, and issues affecting that station |
| `getOperatorProfileReadModel` | `/operators/:operatorId`, operator Markdown, desktop expansion request | Operator's lines and issues affecting those lines in the requested window |
| `getTownProfileReadModel` | `/towns/:townId` | Town's stations, memberships, and their relevant issues |
| `getLinesDirectoryData` | `/lines` | Per-line current status and bounded uptime summary |
| `getStationsDirectoryData` | `/stations` | Per-station current status and bounded uptime summary |
| `getTownsData` | `/towns` | Town/station membership summaries, without global issue-event history |
| `getStatisticsData` fallback | `/statistics` | Latest persisted statistics snapshot only in production |
| `getSitemapData` | `/sitemap.xml` | Persisted or cacheable sitemap projection, rebuilt after data changes |

`rebuildOperationalFacts*` and `rebuildStatisticsSnapshot` are intentionally
bulk callers. They may continue using the complete dataset because they run as
bounded internal workflow work rather than per visitor request.

## Phases

### Phase 0: Establish the Boundary and Baseline — Complete

- Completed: renamed the bulk entry points to `buildCompleteDataset` and
  `getCompleteDataset`.
- Completed: added a repository guard that prevents public server functions
  and public route handlers from importing the bulk builder directly.
- Record the current Neon counters for the unfiltered `impact_events` query
  and its relationship-query batch before each rollout.
- Ensure edge cache rules honour the deployed origin headers for
  `/_serverFn/*` and `GET /api/issues-day`.
- Add a route/feature identifier to request telemetry outside the database
  connection role, so a future cache miss can be attributed without relying on
  SQL text alone.

Exit criteria:

- It is mechanically clear which modules may construct a complete dataset.
- A production sample has a before value for complete-dataset calls and a way
  to correlate a future request with a route.

### Phase 1: Replace Entity Profile Reads — Implementation Complete

- Implement typed scoped readers rather than another generic dataset filter:
  `getIssueReadModel`, `getLineProfileReadModel`, `getStationProfileReadModel`,
  `getOperatorProfileReadModel`, and `getTownProfileReadModel`.
- Fetch root entities first, derive the small set of related line, station,
  service, and issue IDs, then fetch only those rows.
- Bound historical issue/event reads using each route's existing date-window
  input where applicable.
- Keep the existing response contract during migration; add regression tests
  covering current, planned, and no-issue entities.
- Remove the desktop operator profile's duplicate 30-day then 60/90-day full
  read as part of its scoped-reader conversion.

Exit criteria:

- Entity profile and Markdown requests do not invoke the complete builder.
- A representative profile read returns a materially smaller row count and
  payload than the current full-dataset path.

### Phase 2: Replace Directory Reads

- Move `/lines`, `/stations`, and `/towns` to compact directory projections.
- Prefer the existing operational-facts read model for current status and
  bounded uptime where it provides the required data.
- Query static memberships directly instead of loading every issue event.
- Confirm directory routes need only the included entities actually rendered.

Exit criteria:

- Directory routes do not load global issue or impact-event history.
- Their response sizes and route timings are measured before and after.

### Phase 3: Remove Request-Time Global Fallbacks

- Make production statistics require the latest successfully rebuilt snapshot;
  retain the full request-time fallback only for local development or explicit
  internal recovery.
- Build or refresh a sitemap projection during the pull/facts workflow, then
  serve that small result with normal edge caching.
- Audit every remaining `getCompleteDataset`/complete-builder call and classify it
  as bulk maintenance or remove it from the request path.

Exit criteria:

- No normal public route can trigger an unfiltered `impact_events` scan.
- The only complete-builder callers are internal, bounded workflows and
  explicitly documented recovery tools.

### Phase 4: Production Rollout and Verification

- Roll out one route family at a time behind the existing cache configuration.
- Compare Neon `pg_stat_statements` deltas over an equivalent window; the
  unfiltered `impact_events` statement should stop tracking normal public
  traffic.
- Verify Cloudflare `HIT`/`MISS` behaviour for SSR and server-function
  responses, including query-string cache keys.
- Run representative locale, Markdown, canonical redirect, and responsive
  profile checks after each family moves.

Exit criteria:

- The unfiltered `impact_events` query rate is limited to expected workflow
  work, not visitor traffic.
- Production egress and page timings remain stable through a cache purge and a
  Fly Machine restart.

## Progress Log

- 2026-07-18: Renamed the complete-dataset entry points to
  `buildCompleteDataset` and `getCompleteDataset`, with an explicit
  maintenance/recovery-only contract. Added a repository test that prevents
  public server functions and route handlers from importing the complete
  dataset directly. Public data readers still use it indirectly until their
  scoped replacements land in Phases 1 and 2.
- 2026-07-18: Captured the production `pg_stat_statements` baseline for the
  unfiltered `impact_events` query (query ID `-1208032944424713892`): 1,564
  calls, 17,917,184 returned rows, and 13.99 ms mean execution time. Added a
  stable caller label to every complete-dataset entry point; the application
  now emits `complete_dataset_read` logs such as `route:/lines/:lineId` and
  `workflow:operational-facts`, so these counter changes can be correlated
  without changing the database connection role.
- 2026-07-18: Confirmed Cloudflare origin caching for `/_serverFn/*` and
  `GET /api/issues-day`, then observed the deployed `complete_dataset_read`
  production logs. Phase 0 exit criteria are complete.
- 2026-07-18: Added the first Phase 1 scoped reader,
  `getIssueReadModel`. It checks the root issue first, derives the affected
  line/service/station graph from that issue's impact events, and constrains
  both issue history and static network queries before preserving the existing
  issue response contract. Issue page and Markdown requests no longer invoke
  `getCompleteDataset`.
- 2026-07-18: Added `getStationProfileReadModel`. It resolves canonical station
  IDs and station-code aliases before assembly, discovers candidate issues from
  the station and its services, and scopes issue history plus line, service,
  station, town, and landmark reads to the resulting graph. Station profile and
  Markdown requests no longer invoke `getCompleteDataset`; the previous
  function name remains as a compatibility alias.
- 2026-07-18: Added `getLineProfileReadModel`. It resolves the root line before
  discovering its services, stations, issue references, interchange
  memberships, operators, and community-signal entities. Detailed profile and
  Markdown reads now assemble only that scoped graph, while the existing uptime
  rank is derived from compact `line_day_facts` rows instead of complete issue
  history. The previous function name remains as a compatibility alias.
- 2026-07-18: Added `getOperatorProfileReadModel`. It resolves the root
  operator and operated lines first, scopes services, stations, issue
  references, membership lines, and public holidays to that graph, and
  preserves the existing profile payload without constructing the complete
  dataset. Human and Markdown routes now use the scoped reader. The human page
  also performs one 90-day profile request instead of loading 30 days and then
  repeating the read for wider viewports; the previous data-function name
  remains as a compatibility alias.
- 2026-07-18: Added `getTownProfileReadModel`. It resolves the root town and
  its stations before discovering membership lines, services, and candidate
  issues, then scopes issue history and static network assembly to that graph.
  The full-network station-map label contract is preserved with a compact
  station-name projection. Town profile requests no longer invoke
  `getCompleteDataset`; the previous data-function name remains as a
  compatibility alias. All Phase 1 public entry points now use scoped readers;
  production payload and row-count measurement remains part of Phase 4.
- 2026-07-18: Moved the towns directory to a compact static projection. It now
  reads towns, station IDs, active station-to-line memberships, and the small
  set of rendered line entities directly; `/towns` no longer constructs the
  complete dataset or reads issue and impact-event history.
- 2026-07-18: Moved the lines directory to operational facts. Its 90-day
  uptime and ranking now come from `line_day_facts`, while exact live status is
  assembled from only today's active issue-fact candidates. `/lines` no longer
  constructs the complete dataset or reads global issue history.

## Decision Log

- 2026-07-18: Retain the complete dataset as a bulk-workflow abstraction, but
  remove it from public request-time reads. This preserves a useful canonical
  assembly path without paying its full transfer cost per cache miss.
- 2026-07-18: Prefer typed route read models over a Redis cache of the complete
  dataset. A whole-object cache reduces Neon egress but preserves unnecessary
  serialization, transfer, and filtering work.

## Validation

- `npm run verify`
- Contract tests for each migrated reader, including empty and future entities.
- `npm run check:route-timings` (or its current replacement) against warm and
  cache-miss production requests.
- Read-only Neon `pg_stat_statements` samples before and after rollout.
