# Production Egress Reduction Plan

## Context

The completed [scoped public read model](../completed/scoped-public-read-model.md)
removed complete-dataset construction from normal public request paths. Direct
Neon Consumption API measurements show that rollout materially reduced public
network transfer, but the first post-rollout query review found further
request-time amplification in scoped issue and topology reads.

This plan is a focused follow-up to the broader
[production performance](production-performance.md) plan. It covers
database-to-application network transfer and the query shapes that produce it,
rather than client asset or rendered HTML size.

### Measured transfer baseline

The hourly Consumption API series brackets the rollout at approximately
2026-07-18 17:23 UTC. The mixed 17:00-18:00 UTC deployment and backfill bucket
is excluded from the clean comparison.

| Window | Hours | Average transfer/hour | Median transfer/hour | Daily equivalent |
| --- | ---: | ---: | ---: | ---: |
| Clean pre-rollout | 41 | 609.9 MB | 517.4 MB | 14.64 GB |
| Clean post-rollout | 30 | 135.4 MB | 121.6 MB | 3.25 GB |
| Reduction |  | 77.8% | 76.5% | 11.39 GB/day |

Comparator sensitivity is expected because traffic and workflow work vary by
hour. A complete July 17 versus July 19 comparison showed a 65.5% reduction,
while 17 matched clock-hours around the rollout showed an 84.6% reduction.
Use approximately 78% as the central measured result and 65-85% as the observed
comparison range.

The hourly project metric includes all branches, but the production branch
accounted for approximately 98.2% of the current billing-period transfer when
sampled. Neon transfer bytes are the source of truth for the production result;
Postgres row counts below are only a proxy for ranking query families.

### Post-rollout query baseline

A production `pg_stat_statements` sample from the 2026-07-20 06:43:12 UTC
statistics reset through 15:23:38 UTC showed three unfiltered `impact_events`
reads, consistent with bounded workflow work rather than visitor traffic.
Application `SELECT` rows were concentrated in two families:

| Query family | Calls | Returned rows | Share of application rows |
| --- | ---: | ---: | ---: |
| Issue and event history | 13,222 | 4,872,889 | 56.7% |
| Service path topology | 1,919 | 2,441,360 | 28.4% |
| Other application reads | 19,124 | 826,133 | 9.6% |
| Landmarks | 1,796 | 426,757 | 5.0% |
| Facts and snapshots | 48 | 26,934 | 0.3% |

The largest concrete amplification patterns were:

- Issue-scope discovery returned approximately 940,708 intermediate event IDs
  and 930,391 service-ID rows before deduplicating them in application code.
- Dataset path assembly returned 1,595,271 rows across 967 calls, with another
  492,979 rows used for path-scope discovery. The topology is mostly static
  between canonical pulls.
- Date-range discovery expanded 156 logical reads into 1,799 event-ID chunk
  queries and 885 latest-period queries, returning approximately 718,000 rows
  before dataset assembly.
- Crowd-report form options read all 1,912 path rows twice per request: once
  through a revision-to-path join that is deduplicated in application code and
  once as the actual path list. Across 97 calls, those two shapes returned
  370,928 rows.

These measurements indicate that visit and cache-miss volume is a multiplier,
but repeated intermediate and static data remains a material part of transfer
per request.

## Goals

- Reduce avoidable Neon public network transfer without changing public route
  response contracts or canonical data semantics.
- Replace application-side deduplication of large intermediate result sets with
  bounded relational queries or compact projections.
- Stop rereading unchanged service topology for each public request while
  preserving explicit invalidation after canonical pulls.
- Reduce query fan-out for overview, history, and issues-day date ranges.
- Attribute remaining database work to origin cache misses, bots, or genuine
  visitor traffic before treating request count itself as the next problem.
- Preserve the rule that complete-dataset reads are bounded maintenance work,
  not visitor-triggered work.

## Provisional Targets for Triage

Confirm or replace these targets before implementation:

- Reduce returned rows for each selected query family by at least 50% in a
  comparable `pg_stat_statements` window.
- Reduce median hourly public network transfer below 100 MB over a complete
  post-deploy day, without increased errors or route latency.
- Keep normalized transfer below 2.5 GB/day under comparable traffic.
- Do not regress the existing approximately 78% improvement over the original
  complete-dataset production baseline.

## Non-Goals

- Do not cache the complete 6 MB dataset object as the solution.
- Do not change canonical pull inputs, conflict resolution, or archive
  ownership.
- Do not optimize Neon/Postgres internal monitoring statements; their high
  call counts and single-row results are not application read-model work.
- Do not infer HTTP visit counts from SQL call counts. Use Cloudflare request
  and cache analytics for that attribution.
- Do not reduce user-facing HTML or asset bytes unless a selected query change
  also requires a response-contract change.
- Do not record the privately supplied origin hostname or route in repository
  files.

## Candidate Workstreams

### A. Collapse Issue-Scope Discovery

Current code first fetches every impact-event ID for candidate issues, then
fetches service and facility references for those IDs, and deduplicates the
result in memory.

Candidate changes:

- Join `impact_events` directly to entity reference tables while filtering by
  `issue_id`.
- Select distinct service IDs, line IDs, and station IDs in Postgres.
- Avoid transferring intermediate impact-event IDs to the application.
- Preserve query-prefix timing labels and add explicit row-count telemetry for
  the new scope query.
- Add contract tests for issues with repeated service-scope events,
  station-only impacts, whole-line impacts, and no references.

Exit criteria:

- The current event-ID and service-ID-only discovery shapes disappear from
  public profile reads or return at least 90% fewer rows.
- Line, station, operator, town, and issue profile payloads remain equivalent.

### B. Collapse Date-Range Fan-Out

`getIssuesOverlappingRange` currently retrieves overlapping period-event IDs,
chunks those IDs into event queries, retrieves all period events for candidate
issues, chooses the latest events in memory, and then assembles a dataset.

Options to triage:

1. Use one SQL CTE/window query that returns only final overlapping issue IDs.
2. Persist an `issue_day_facts` or equivalent projection during facts rebuilds
   for overview, history, and `/api/issues-day`.
3. Use the SQL path first, then add a projection only if measured transfer or
   latency remains material.

Exit criteria:

- One logical date-range request no longer produces event-ID chunk fan-out.
- Day, month, year, current, planned, and open-ended issue semantics have
  regression coverage.
- Overview, history, and issues-day response contracts remain unchanged.

### C. Reuse Static Service Topology

Service revisions and path station entries change only with canonical data, but
scoped datasets repeatedly fetch large portions of the same topology.

Options to triage:

1. Persist a compact topology snapshot refreshed after canonical pulls.
2. Cache only topology rows by canonical manifest or metadata version, with
   explicit invalidation after successful pulls.
3. Narrow queries to the revision actually required for public rendering where
   historical revision semantics are unnecessary.
4. Select distinct station IDs for scope discovery so repeated revisions do
   not duplicate membership rows.

This cache or projection must remain topology-specific. It must not become a
renamed cache of the complete issue and network dataset.

Exit criteria:

- Normal public requests do not repeatedly transfer the unchanged full path
  topology.
- A canonical pull refreshes or invalidates the selected representation before
  new public responses are served.
- Historical service-revision and direction-station behavior remains correct.

### D. Remove Crowd-Report Form Duplication

The report form's revision query joins every revision to every path entry,
deduplicates revision rows in application code, and then independently fetches
the complete path list.

Candidate changes:

- Query service revisions without the path join.
- Fetch path entries once.
- Cache the compact form-option payload until the next canonical pull.
- Confirm public caching does not allow stale direction options after a pull.

Exit criteria:

- One report-form options build transfers one path set, not two.
- Form line, station, service, revision, and direction options are unchanged.

### E. Attribute Origin Request Volume

SQL counters cannot distinguish human visits, bots, cache misses, or cache-key
fragmentation.

Measurement tasks:

- Export Cloudflare requests by normalized route family and cache status.
- Compare origin `MISS`/`BYPASS` volume with database feature labels over the
  same hourly window.
- Identify query-string, locale, Markdown, and TanStack server-function cache
  keys that produce repeated origin work.
- Separate known bots from likely human traffic where Cloudflare analytics
  supports it.
- Check whether cache TTL or invalidation frequency, rather than visitor volume,
  explains the remaining origin request rate.

Exit criteria:

- Remaining origin-triggered dataset assemblies can be expressed per route
  family and per cache miss.
- Any cache-key or bot mitigation proposal has measured expected impact before
  implementation.

### F. Lower-Priority Static Reads

Landmark reads represented approximately 5% of application rows in the sampled
window. Revisit them after the issue and topology workstreams unless a
route-specific profile shows unusually wide landmark payloads.

## Candidate Triage Order

This is intentionally provisional:

| Candidate | Expected opportunity | Effort | Contract risk |
| --- | --- | --- | --- |
| Direct distinct issue-scope queries | High | Medium | Medium |
| Remove report-form duplicate path join | Medium | Low | Low |
| Collapse date-range fan-out in SQL | High | Medium | High |
| Persist or cache static topology | High | Medium-High | Medium |
| Cloudflare origin-volume attribution | Enables prioritization | Medium | Low |
| Landmark/static metadata cleanup | Low | Low-Medium | Low |

## Phases

### Phase 0: Confirm Baselines and Triage

- Capture a fresh 48-72 hour hourly Consumption API window.
- Capture the matching `pg_stat_statements` reset timestamp and query-family
  counters without manually resetting production statistics.
- Obtain Cloudflare cache-status and normalized route-volume data if available.
- Select the first implementation tranche and confirm success thresholds.

Exit criteria:

- The chosen candidates, order, owners, and measurement windows are recorded.
- We can distinguish measured transfer bytes from row-count proxies.

### Phase 1: Low-Risk Deduplication

- Implement the selected issue-scope relational deduplication.
- Remove the crowd-report revision/path duplication.
- Measure each query-family delta before considering a projection.

Exit criteria:

- Response contracts and tests pass.
- Selected intermediate and duplicate query rows show the agreed reduction.

### Phase 2: Date-Range Read Model

- Implement the chosen SQL or projection design for overlapping issues.
- Migrate overview, history, and issues-day consumers together or behind a
  compatibility wrapper.
- Verify cache-query separation for day inputs.

Exit criteria:

- Date-range reads are bounded and no longer fan out through chunked IDs.
- Current and historical route behavior remains correct.

### Phase 3: Static Topology Reuse

- Implement the selected topology snapshot or cache.
- Wire refresh or invalidation to successful canonical pulls and manual facts
  rebuilds where appropriate.
- Confirm Machine restarts and cold caches remain correct.

Exit criteria:

- Public requests do not transfer unchanged topology repeatedly.
- Pulls publish new topology atomically with dependent read models.

### Phase 4: Cache and Traffic Refinement

- Use Cloudflare measurements to address only verified cache-key, TTL, or bot
  problems.
- Preserve correct locale, Markdown, query-string, and server-function cache
  separation.

Exit criteria:

- Any cache change reduces measured origin work without serving incorrect or
  stale route data.

### Phase 5: Production Verification

- Compare at least one complete pre/post day and matched clock-hour windows.
- Compare mean and median hourly public transfer; exclude and document rollout
  buckets rather than mixing them into steady-state results.
- Compare selected `pg_stat_statements` family deltas using the recorded reset.
- Run representative route, locale, Markdown, history, report-form, and
  responsive checks.

Exit criteria:

- The agreed transfer target is met over representative traffic.
- No public route semantics, cache behavior, workflow work, or page timings
  regress.

## Progress Log

- 2026-07-21: Drafted the follow-up plan from the measured approximately 78%
  rollout reduction and the first post-rollout query-family sample. No further
  implementation priority has been approved yet; candidate ordering and
  success targets remain subject to triage.

## Decision Log

- 2026-07-21: Treat Neon public network transfer bytes as the production source
  of truth. Use `pg_stat_statements.rows` only to locate likely contributors,
  because row widths and selected columns vary.
- 2026-07-21: Exclude the mixed deployment hour from steady-state comparisons.
  Report full-day and matched-hour sensitivity alongside the central estimate.
- 2026-07-21: Keep this plan separate from the broad production-performance
  plan so database egress work has explicit query-family baselines and exit
  criteria.

## Triage Questions

- Should the first tranche prioritize the low-risk report-form fix, the larger
  issue-scope reduction, or implement both together?
- Should date-range work begin with a single SQL query or proceed directly to a
  persisted daily projection?
- Is topology allowed to remain stable until the next successful canonical
  pull, and which version marker should key it?
- Should the initial target be 100 MB median transfer per hour, 2.5 GB/day, a
  percentage reduction, or a combination?
- Can Cloudflare provide route-level cache-status and bot analytics for the
  same hourly windows used by Neon?
- Which route families should form the required production regression set?

## Validation

- Run `npm run verify` for every implementation tranche.
- Add focused contract tests before replacing application-side assembly.
- Record `pg_stat_statements_info.stats_reset` with every SQL sample; do not
  reset production counters merely to simplify measurement.
- Use Neon Consumption API hourly public-network-transfer bytes for short-term
  comparisons and daily granularity for longer follow-up.
- Verify canonical pull and manual rebuild refresh/invalidation behavior.
- Verify Cloudflare `MISS` to `HIT` transitions and independent query-string
  cache keys after relevant changes.
- Keep the privately supplied origin hostname out of commands and repository
  documentation.
