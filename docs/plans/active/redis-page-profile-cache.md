# Cache public page profiles in Redis

## Purpose

Cache Postgres-built Navigation and completed Issue Profiles in the existing
Redis instance. The site reuses those responses across origin requests to
reduce query work and give Neon longer idle periods. Postgres remains the
relational read model and handles cache misses. Preserve existing URLs,
response shapes, and report behavior.

Next: validate the opt-in service-path reader in staging. The implementation
reuses generation-scoped path inputs for date-range readers. Aggregate Redis
billing and limit evidence is still needed before production enablement.

## Progress

- [x] Map public reads, live reporting dependencies, and the release workflow
  (2026-11-15).
- [x] Confirm Redis configuration in all Fly environments and reachability
  from production (2026-11-15).
- [x] Confirm continuous Neon activity in the production usage window
  (2026-11-15).
- [x] Implement the opt-in Navigation reader and canonical-pull publication.
- [x] Seed and serve Navigation from Redis on both staging Fly Machines
  (2026-11-15).
- [x] Verify an authenticated Cloudflare MISS for staging Navigation
  (2026-11-15).
- [x] Implement generation-guarded cache fills for completed Issue Profiles.
- [x] Enable Issue Profiles in staging and verify the seed, cold and warm
  reads, and publication retry behavior (2026-11-15).
- [x] Deploy the staging-verified production revision with both readers off,
  seed Navigation, and verify generation and SQL parity (2026-11-16 PT).
- [x] Verify both readers together in production after the compatibility fix
  (2026-11-16 PT).
- [x] Compare the first 21 complete production hours after the user ended
  the planned 24-hour observation (2026-11-17 PT).
- [x] Evaluate the pilot and keep both readers enabled. Defer expansion
  pending attribution of the remaining SQL reads.
- [x] Attribute query families with source review, fresh statement deltas,
  and controlled origin GETs (2026-11-17 PT).
- [x] Check available Redis telemetry and identify the account-level evidence
  still missing (2026-11-17 PT).
- [x] Implement opt-in service-path reuse for date-range readers and validate
  SQL snapshot parity locally (2026-11-17 PT).
- [ ] Seed and validate the service-path reader in staging.
- [ ] Capture aggregate Redis usage, billing, and limits before enabling the
  next reader in production.

## Surprises & Discoveries

- A November 15 production check found 166 complete hourly buckets at the
  equivalent of continuous 0.25 CU usage with a five-minute suspend timeout.
  Each of the three Navigation query shapes had run 233,085 times since the
  October 14 statement statistics reset.
- A 91-second sample contained 56 incident and analytics statements, 54
  topology and entity statements, and 12 Navigation statements. Three reads
  matched the Issue Profile evidence query. The sample contained zero
  timetable, rider-arrival, or pull-lease statements. Use these counts to
  identify candidate reads. Route-level attribution needs a longer timeline.
- Production has two Fly Machines in Singapore and uses stop/start. A
  Fly-side probe reached the configured Upstash Redis endpoint. A shared
  Redis entry can serve either Machine after a restart.
  [Fly configuration](../../../fly.production.toml) ·
  [Redis limiter](../../../app/limiters/crowdReport.ts)
- The Issue Profile builder resolves inferred interval ends and computes
  elapsed durations against the clock. It also selects date-effective
  topology. Start with completed profiles scoped to one Singapore date.
  [Dataset builder](../../../app/util/dbQueries/dataset.ts)
- Production Postgres returned empty train car count arrays for SKLRT and
  NEL. The completed profile cache validator rejected the arrays, so each
  request for the SKLRT upgrade profile fell back to SQL with `no-store`.
  The existing line model uses an empty array for unknown counts.

## Decision Log

- 2026-11-15, Codex — Pilot Navigation and completed Issue Profiles in the
  existing Redis deployment. Keep Postgres as the relational read model and
  build cache entries from the same public loader data.
- 2026-11-15, Codex — Seed Navigation through the authenticated pull task.
  It takes the existing lease and requires the successful manifest fingerprint,
  which is cleared at the start of live promotion. The publish-only setting
  allows an operator to warm and inspect the key before enabling reads.
- Issue Profiles use the same published generation as Navigation and a
  separate read flag. Entries are capped at 128 KiB and expire at Singapore
  midnight. Redis compares the generation atomically when a fill writes.
- 2026-11-16 — Roll out both readers in the same production release window.
  Verify each reader during cutover and measure the combined effect after
  both are live. Keep separate flags for rollback.
- 2026-11-17 — The user ended the planned midnight observation and requested
  a comparison using the available data. Use 21 complete hours, retain both
  verified readers, and defer additional cache implementation.
- 2026-11-17, follow-up — Select service-path rows as the next bounded cache
  candidate. Start with date-range readers, retain current-time issue assembly,
  and treat the change as an egress reduction. Arrival and other live SQL reads
  remain a separate obstacle to suspension.

## Outcomes & Retrospective

- 2026-11-15 — Deployed `33bf615` to Fly staging in publish-only mode with the
  existing timetable pin. The manual build skipped Sentry source-map upload.
  The staging success fingerprint allowed seed run
  `wfr_PM9UlB4jmR1VUzwR9Ycet` to reuse the completed import. QStash retried a
  Redis connection failure, then published the same workflow generation,
  purged the edge tag, and released the lease. The 2,804-byte entry matched
  the three ordered SQL results for 11 lines, three operators, and the
  last-pull timestamp.
- Enabled the reader through the staging Fly runtime setting, then purged
  `mrtdown-staging-data`. Both Machines returned HTTP 200 with
  `X-MRTDown-Navigation-Source: redis` on Fly origin requests, including a
  cold start and `/ms/about`. The English header and footer matched the SQL
  baseline. Staging had no `pg_stat_statements` view. A local production build
  served the Redis hit without `DATABASE_URL` and returned the same rendered
  Navigation with `no-store` for missing, invalid, and timed-out Redis data.
- `npm run verify` passed 618 tests with local PostGIS.
- After PR #309 merged and the staging deployment completed, the user
  confirmed `CF-Cache-Status: MISS` and
  `X-MRTDown-Navigation-Source: redis` on the same authenticated staging
  response. This completes Milestone 1 acceptance.
- Milestone 2 passed 631 tests with PostGIS. The built server matched HTML
  and Markdown against disposable PostGIS and Redis data, preserving evidence
  order, redaction, affected entities and 404s. A warm profile survived a
  paused promotion. A cold fill held across publication returned `no-store`
  and wrote neither generation. A following fill served the correction.
  The same probe covered Redis timeout and expiry at Singapore midnight.
- Deployed `d437275` to Fly staging and enabled `REDIS_ISSUE_PROFILE_CACHE`
  after seed workflow `wfr_43cV0_YJDzhjPrQlBZJDE` succeeded. The manual build
  skipped Sentry source-map upload. Postgres and Redis agreed on the active
  generation. The completed SKLRT profile used 36,861 bytes and expired at
  Singapore midnight. Both Machines served it from Redis, including a new
  process. The staging Markdown and Malay HTML matched their SQL baselines.
  The cold fill, ongoing issue and future issue responses used `no-store`.
  Missing issue responses remained 404. The existing report limiter blocked
  a synthetic sixth request. The staging checks exercised the seed workflow.
  Partial promotion and publication failure injection used isolated local
  PostGIS, Redis and workflow fixtures.

- PR #310 deployed to staging as `52d814e`. Navigation and completed Issue
  Profiles returned Redis hits. An ongoing issue used SQL with `no-store`,
  and an unknown issue returned 404.
- The 24-hour production baseline ending November 16 at 10 p.m. Pacific was
  6.00 Neon CU-hours, 4.72 GB of Neon public egress, and 935 ms Fly app p95
  across about 17,095 Fly app responses. No Neon suspension was observed.
- November 16, 11:35 p.m. PT. The
  [production deployment](https://github.com/foldaway/mrtdown-site/actions/runs/44039627164)
  promoted `52d814e` to both Fly Machines as release 77 with both readers off.
  The approved timetable pin matched the GitHub production environment,
  and the three QStash schedules matched their pre-deploy configuration.
  Postgres had a successful canonical fingerprint and no active pull lease.
- Release 78 set Navigation to publish-only. Authenticated seed
  `wfr_ao68-GdbHPYUPAL1tNaTo` completed without retries and released its lease.
  Both Machines read the 2,804-byte entry from Redis. The Redis and Postgres
  generations matched, as did the ordered SQL results for 11 lines, three
  operators, and the last-pull timestamp.
- Release 79 enabled both readers in a single Fly rollout. Cloudflare
  accepted the `mrtdown-production-data` purge at 11:40 p.m. PT. Navigation
  matched the SQL-rendered header and footer. The completed SKLRT profile
  matched SQL Markdown but failed to fill Redis. Release 80 disabled only
  the Issue Profile reader and the data tag was purged at 11:45 p.m. PT.
  [PR #311](https://github.com/foldaway/mrtdown-site/pull/311) adds the
  compatibility fix and the cold-fill and warm-read regression test.
- PR #311 passed 633 tests with local PostGIS and
  [deployed to staging](https://github.com/foldaway/mrtdown-site/actions/runs/44041455750)
  as `0dc2add`. Staging verified Redis Navigation and completed HTML and
  Markdown, ongoing SQL with `no-store`, and an unknown issue 404. A cold
  Navigation request fell back to SQL before the staging Redis read
  succeeded on retry.
- November 16, 11:53 p.m. PT. The
  [hotfix deployment](https://github.com/foldaway/mrtdown-site/actions/runs/44041894782)
  promoted `0dc2add` to Fly release 81. The exact deployed validator accepted
  the previously rejected production SQL profile. The timetable pin and
  QStash schedules were verified again. Release 82 ran both readers on
  both Machines, and Cloudflare accepted the tag purge at 11:56 p.m. PT.
- Both production Fly Machines served Navigation with the same rendered
  header and footer as SQL. The first completed SKLRT Markdown response
  filled Redis and returned `no-store`. Warm Markdown matched the SQL body
  byte for byte, and Malay HTML shared the entry. The entry used 36,859 bytes
  and expired at Singapore midnight. Repeated ongoing issue requests used SQL
  with `no-store` and left no Redis entry. Unknown HTML and Markdown returned
  404. Cloudflare challenged the direct public smoke probes, so the cache
  response checks used the Fly origin and the purge used the Cloudflare API.

### Production measurement

The user ended observation at 9:27 p.m. PT on November 17. The midnight
capture process was stopped. The comparison uses 21 complete hourly buckets
from November 17, midnight to 9 p.m. PT
(`2026-11-17T08:00:00Z` to `2026-11-18T05:00:00Z`). The baseline covers
24 hours ending November 16 at 10 p.m. PT.

| Metric | Baseline, 24 hours | Both readers, 21 hours |
| --- | ---: | ---: |
| Fly app responses | 17,095 | 18,971 |
| Fly app responses per hour | 712 | 903 |
| Fly app median | 134 ms | 124 ms |
| Fly app p95 | 935 ms | 944 ms |
| Neon public egress | 4.723 GB | 4.079 GB |
| Neon public egress per hour | 196.8 MB | 194.3 MB |
| Neon public egress per app response | 276.3 KB | 215.0 KB |
| Neon compute | 6.00 CU-hours | 5.25 CU-hours |
| Neon compute per hour | 0.250 CU | 0.250 CU |
| Observed Neon suspension | None | None |

Use decimal bytes. The exact egress totals were 4,722,665,025 and
4,079,482,898 bytes. Compute totals were 21,594 and 18,912 CU-seconds.
Fly metrics used `increase(fly_app_http_responses_count{app="mrtdown-site"}[window])`
summed across statuses and the response-time histogram summed across Machines.
The provider sources were [Fly monitoring](https://fly.io/apps/mrtdown-site/monitoring)
and the [Neon production branch](https://console.neon.tech/app/projects/crimson-meadow-37625546).

Egress per app response fell 22.2% while responses per hour rose 26.8%.
Egress per hour fell 1.3%. The p95 changed by about 1%, and compute stayed
equivalent to continuous 0.25 CU usage. The endpoint retained a five-minute
suspend timeout and its October 14 start time. Operation history showed
configuration changes during the window and no suspend or start operation.
The different window lengths, route mix, and overlapping deployment limit
attribution of these changes to Redis.

### Supporting evidence and limits

- Navigation SQL statement counts increased by only 22 calls for each of
  its three shapes between November 17, 6:56 a.m. and 9:28 p.m. PT.
  The Issue Profile evidence shape increased by 734 calls. This shape
  serves live issues, cold fills, fallbacks, and diagnostic reads.
  Route-level hit and fallback totals were unavailable.
- The same 14.5-hour statement sample recorded 2,114 calls each to broad
  network entity queries, 2,702 calls to the 55-revision service path shape,
  2,935 public-holiday reads, and 2,102 overlapping-issue queries.
  Counters retained the October 14 reset time and had zero eviction events.
  [Dataset reads](../../../app/util/dbQueries/dataset.ts) and
  [range reads](../../../app/util/dbQueries/issueRange.ts) connect these
  shapes to overview, history, weekly reports, and station directories.
  An 8.5-minute request-log sample also contained ten station-arrival API
  requests and nine station-profile responses. This identifies continuing
  SQL workloads, while per-route idle-period attribution remains open.
- The [integrated Station Guide deployment](https://github.com/foldaway/mrtdown-site/actions/runs/44042729265)
  completed at 12:01 a.m. PT on November 17. Live revision `3b7c849`
  retained both Redis reader flags. The comparison also includes that
  independent change to station pages and their reads.
- The pre-cutover snapshot was at 11:38 p.m. PT on November 16. Fly SSH
  timed out at the planned boundary, so the next snapshots used Fly Machines
  exec at 6:56–6:57 a.m. PT. Use the counter deltas as supporting evidence
  and the provider metrics for the exact comparison window.
- The existing Cloudflare token returned an authorization error for the
  cache-status analytics query. Per-route cache hit rates are unavailable
  for this comparison. Redis INFO exposed command, memory, hit, and miss
  snapshots, but provided no run identifier or command/error breakdown.
  Observed memory ranged from zero to 421,926 bytes. At 9:28 p.m. PT the
  snapshot showed 152,681 bytes, 4,070 processed commands, 4,373 keyspace
  hits, and 272 misses. These are point-in-time server counters, with
  insufficient continuity for aggregate usage, hit rate, cost, or limiter
  headroom claims.
- Final origin smoke tests passed for Navigation, completed Markdown and
  Malay HTML, ongoing SQL with `no-store`, and unknown issue 404s. The
  Navigation value still matched ordered SQL and the Postgres generation.
  The completed profile had refilled after Singapore midnight with the next
  midnight expiry. Both readers, the approved timetable pin, and all three
  QStash schedules were verified on live revision `3b7c849`. The pull
  fingerprint remained complete and the lease was clear.
- Final `npm run verify` passed all 636 tests with local PostGIS.

Keep both verified readers enabled. The partial comparison supports lower
egress per response, while Neon suspension and p95 improvements remain
unobserved. Before expanding Redis, attribute the remaining broad dataset
and live arrival reads by route and capture aggregate Redis usage and cost.

### Follow-up attribution, November 17 PT

A fresh counter sample from 9:28 to 10:01 p.m. PT retained the October 14
statistics reset and zero evictions. It recorded 69 calls each to the schedule
selector's topology, retained timetable history, and projection metadata shapes,
and 82 public-holiday reads. Navigation added one line/operator read and zero
last-pull reads; these shapes can also be used outside Navigation.

The next bounded Fly log sample covered 9:53:49–10:01:34 p.m. PT. It contained
13 successful arrival API requests, five successful station pages, two overview
requests, one history page, and one weekly report. There were 32 health checks.
The sample is a short origin slice, not a route distribution for the comparison
window. Arrival requests occurred in branch-sized bursts. The station UI
[refreshes each branch every 30 seconds](../../../app/routes/{-$lang}/stations/$stationId/components/useStationArrivals.ts).
The [API](../../../app/routes/api.stations.$stationId.arrivals.v2.tsx) reads
the selected timetable from SQL and, for branch requests, also reads the recent
rider report. Its responses use `no-store`.
A continuously open station page can therefore prevent a five-minute idle
period even if its HTML and Navigation are cached.

At 10:04 p.m. PT, sequential loopback GETs on live revision `3b7c849` bracketed
each response with statement snapshots. All ten responses succeeded. The table
records observed deltas; concurrent traffic is possible, so source review is
also required for attribution. Counts include transaction control statements
and exclude the diagnostic statement-statistics queries. Rows are not bytes.

| Origin request | Statements | Rows | Confirmed query family |
| --- | ---: | ---: | --- |
| `/healthz`, `/about` | 0 each | 0 each | Health is SQL-free; warm Navigation needs no SQL |
| `/` | 25 | 6,681 | Date range, broad topology, holidays, community signals |
| `/system-map` | 24 | 6,681 | Same range/topology builder |
| `/history/2026/10` | 24 | 6,705 | Date range and broad topology |
| `/reports/weekly/2026-09-28` | 25 | 6,792 | Range/topology plus sitemap snapshot |
| `/stations` | 6 | 757 | Directory queries; no active-issue dataset this time |
| `/stations/JUR` | 41 | 16,041 | Scoped station and issue graph, holidays, service paths |
| JUR arrivals, EWL eastbound to PSR | 22 | 3,831 | Schedule topology, selection, departures, recent rider report |
| `/statistics` | 1 | 1 | Stored statistics snapshot |

Each of the four range requests reread the same 11 static query results:
3,855 rows, including 2,088 path entries. Issue IDs are scoped, but
[getIssuesOverlappingRange](../../../app/util/dbQueries/issueRange.ts) calls
`buildDataset` without a static scope. This explains repeated full network
reads without a complete issue-dataset read. The directory adds the same
builder only when active issue IDs exist. Station profiles can select all 55
revision IDs too, so the 55-parameter path shape alone cannot identify a route.
The 104-row holiday shape also serves line, station, operator, and town profiles.

Arrivals use a separate
[live schedule topology reader](../../../app/util/dbQueries/readLiveScheduleTopology.ts).
It reloads 11 topology tables, including all paths, within the selector's
repeatable-read transaction. Its ordered path query differs from the dataset's
55-revision query. A topology cache for `buildDataset` alone would leave this
arrival workload in place.

The managed job definitions are daily canonical pull, monthly holiday sync,
and weekly crowd-report dispatch. Pull rebuilds operational facts, statistics,
and sitemap snapshots; those are bounded broad reads. Public statistics and
sitemap routes read stored snapshots. Holiday sync can rebuild facts and purge
the edge independently of a canonical pull. These jobs do not explain the
observed arrival query bundles. Request logs and statement counters lack a
shared request/job identifier, so the full 21-hour workload and every potential
idle period remain unattributed.

A read-only sizing snapshot at 10:06 p.m. PT serialized the 11 static results
to 683,747 bytes; the 2,088 path rows alone used 263,893 bytes. This is diagnostic
node-postgres JSON, not measured wire egress or a finalized cache schema. It
supports starting with paths and requires a separate size budget from the
128 KiB Issue Profile limit. The original 14.5-hour path sample returned
5,641,776 rows, making paths a concrete repeated-transfer candidate.

Both existing reader flags remained enabled. The live timetable pin matched
the prior manifest/release hashes, the canonical fingerprint was present,
canonical topology promotion was complete, and SQL and Redis agreed on
`wfr_ao68-GdbHPYUPAL1tNaTo`. All three production QStash schedules remained
unpaused with their existing cron expressions. No production configuration,
schedule, or data was changed by these diagnostics.

### Service-path implementation, November 17 PT

The opt-in reader now covers the range builder shared by overview/system map,
history/day, and weekly reports. The 512 KiB entry has a 24-hour Redis TTL; a
single five-minute local memo avoids repeated payload transfer. Reads use
bounded `GETRANGE`, copy rows before assembly, and never write cache entries.
All participating SQL reads share a repeatable-read snapshot and validate its
completed generation before reusing paths. SQL fallback responses use `no-store`.

The pull publishes immutable path contents under its lease before purge and
fingerprint completion. A standalone `seedServicePathCache` task seeds the
current generation without advancing it. Unchanged-manifest pulls verify and
renew the entry, preventing a skipped import from leaving an expired cache.
The existing generation marker is maintained independently of all reader flags.
See the [service-path runbook](../../operations/edge-caching.md#service-path-inputs).

Local `npm run verify` passed 657 tests with PostGIS, including range output
parity, historical/shared revision IDs, open intervals, midnight, empty ranges,
partial promotion, and a SQL snapshot held across correction/publication. Cache
tests cover malformed/oversize data, timeouts, concurrent generations, bounded
memoization, mutation isolation, retry, and immutable retention renewal. The
staging build passed without Sentry source-map upload.

### Redis aggregate evidence still needed

The fresh INFO snapshots again lacked a run identifier. At 10:04 p.m. PT one
reported 2,898 bytes, 4,134 processed commands, 4,436 hits, and 274 misses;
an earlier probe returned no usable INFO fields. These remain point snapshots,
not billing totals or a defensible hit rate. The production runtime had no
separate Upstash management credential names, no Upstash CLI/config was found
locally, and browser access was not approved in this chat.

The provider offers account-level [database stats](https://upstash.com/docs/devops/developer-api/redis/get_database_stats)
including daily requests and billing, and [usage charts](https://upstash.com/docs/redis/howto/metrics-and-charts)
for commands, throughput, connections, and hits/misses. Obtain that evidence
for the configured database and matching timestamps, plus its actual plan,
command/connection limits, budget, errors, and eviction policy. Include the
shared crowd-report limiter. The public pay-as-you-go command rate is currently
[$0.20 per 100,000 commands](https://upstash.com/pricing/redis); this is a
conditional unit rate, not evidence of this database's plan or actual cost.
Do not infer spare limiter capacity from a small memory snapshot.

Follow-up `npm run verify` passed all 636 tests with local PostGIS. Diagnostic
helpers and raw evidence remain under `/tmp/mrtdown-production-followup-*`;
the tables and limitations here are the durable handoff.

## Context

The shared layout reads line and operator navigation and last-pull metadata.
The Issue Profile reader joins evidence, effect intervals, and affected
network entities for the issue page and its Markdown equivalent. Reuse the
current output shapes as the basis for cached profiles. Cloudflare still
serves cached HTML, Markdown, and server-function responses. The shared
profile cache handles requests that reach the origin. The existing site pull
imports the canonical archive from `mrtdown-data` into Postgres. The pilot
adds Redis publication after the pull rebuilds the read model.
[Navigation query](../../../app/util/dbQueries/root.ts) ·
[Issue Profile builder](../../../app/util/dbQueries/issue.ts) ·
[Site data pipeline](../../architecture/data-pipeline.md) ·
[Edge caching](../../operations/edge-caching.md)

### Redis cache contract

- Use a tier- and schema-versioned namespace separate from the crowd-report
  limiter. Store Navigation and the active generation in one value. A
  generation identifies a completed canonical import. Issue keys also
  include the Singapore date and issue ID. Reuse the existing Redis
  connection configuration with bounded timeouts.
- Cache the public loader result after evidence redaction. Share one in-flight
  fill per key per process. Set expiry on issue entries and cap their size.
  Check cache memory and command usage against the rate limiter's headroom.
- An absent, invalid, or unavailable cache entry falls back to the current
  SQL reader. During promotion, continue serving warm profiles from the
  last completed generation. Treat fallback responses from an incomplete
  import or cache outage as uncached at both Redis and Cloudflare. Keep the
  default not-found behavior for missing issues.

## Plan of Work

### Milestone 1 — Serve Navigation from Redis in staging

1. Add a server-side Redis reader behind an environment flag. Read
   Navigation in `getRootFn` and keep locale message loading independent.
   Verify the Redis data matches the SQL reader.
2. At the end of the canonical pull, build Navigation after promotion and
   snapshot rebuilds. Publish it with the generation before purging
   Cloudflare. Derive the generation from the workflow run so callback
   retries reuse it and a later repair can advance it. Preserve the
   existing ordering that records the successful pull fingerprint after
   cache publication and purge.
3. Prepopulate the key from a verified completed staging import before
   enabling the reader, including when the next scheduled pull would skip
   an unchanged manifest. Validate a cold Fly process and a Cloudflare miss.
   A warm Redis key must serve both with zero Navigation SQL queries. Follow
   the [bootstrap procedure](../../operations/edge-caching.md#redis-navigation-bootstrap).
   [Root loader](../../../app/util/root.functions.ts) ·
   [Pull workflow](../../../app/workflows/pull/index.ts)

### Milestone 2 — Cache completed Issue Profiles and measure the pilot

1. Add the cache read around the shared issue server function used by HTML
   and Markdown. Cache profiles with at least one interval and all intervals
   ended. Keep the live SQL path for ongoing and future issues until
   interval resolution can run from cached inputs. Use the same captured
   clock for the Singapore date and profile build.
2. Guard cold fills against partial promotion. Before the first live
   canonical write, record that the read model is updating in existing
   Postgres metadata. Mark the new generation complete after the rebuilds
   and before Redis publication. Read that marker and the profile in the
   same repeatable-read SQL snapshot on misses. Cache only when the marker
   matches the published Redis generation and its state is complete. Keep
   the updating state after a partial import failure until recovery. Cache
   hits use Redis alone. Return cold-fill responses with shared caching
   disabled so an in-flight fill cannot refill the edge after a purge.
   Subsequent Redis hits can populate the edge. Test that a fill crossing
   publication cannot write into the new generation.
   [Staging enablement and rollback](../../operations/edge-caching.md#completed-issue-profiles)
3. Promote the staging-verified revision to production with the readers
   disabled. Seed and verify the shared Navigation value and generation.
   Enable both readers in the same release window, purge the public data
   tag, and verify Redis hits and SQL fallbacks. Disable the affected reader
   and purge the tag to roll back.
4. After the rollout is verified, compare a full day with the production
   baseline. Measure Redis hits, SQL fallbacks by route, origin latency,
   Redis commands, memory, and errors, and Neon CU-hours, egress, and
   suspended time. Use Cloudflare cache status where available to account for
   changes in origin traffic.
   [Issue server function](../../../app/util/issue.functions.ts) ·
   [Request timing](../../../app/server.ts) ·
   [Database timing](../../../app/util/dbQueries/database.ts)
5. If Neon still stays active after the migrated reads fall away, identify
   the routes or jobs that still touch Postgres during potential idle
   periods. Use that evidence and Redis costs to decide whether to extend
   the cache.

### Milestone 3 — Reuse service-path inputs for date-range readers

1. Prototype one immutable, tier- and schema-versioned Redis entry per
   completed import generation containing only the selected path columns.
   Publish from SQL under the canonical pull lease; maintenance readers keep
   direct SQL. Give the new flag independent generation marking and publication
   so rolling back Issue Profiles cannot disable path invalidation. Start with
   a separate opt-in reader flag and a 512 KiB per-entry ceiling, then measure
   the actual validated encoding before retaining that limit. Oversize or
   unavailable entries use SQL. Give old-generation keys a bounded retention
   period and account for their total size and key count.
2. First integrate overview/system map, history/day, and weekly-report range
   reads. Put issue discovery, revision selection, generation validation, and
   dataset assembly in one read-only repeatable-read transaction. Reuse paths
   only when that snapshot sees the same completed generation; `updating`, a
   missing marker, or a mismatch uses paths read through that transaction.
   A Redis generation pointer alone cannot establish consistency with SQL.
3. Filter cached rows with the existing revision-ID semantics, including
   repeated revision IDs across services. Preserve per-service revision grouping
   and path-index ordering. Continue computing intervals, effective revisions,
   durations, date boundaries, and holidays at the request clock. Leave metadata,
   holidays, issue/evidence rows, and rider reports outside the entry. Holiday
   sync has its own write/purge path and must not silently inherit a canonical
   generation's lifetime.
4. Memoize at most the current decoded entry per process, share in-flight
   loads, and protect cached rows from mutation. Validate the SQL generation
   on each read; the memo reduces Redis payload transfer, not freshness checks.
   Bound Redis deadlines, decoding, and memory. Fallback during incomplete
   promotion remains `no-store`; never publish a snapshot built from partial
   live data. Publish before the existing cache purge/fingerprint completion.
5. Test SQL parity for the four measured range routes, corrections, empty
   ranges, overlapping/open intervals, midnight, revision-ID collisions,
   malformed/oversize Redis values, restart, timeout, and publication races.
   A warm route must execute zero dataset path SQL while retaining its other
   reads. Add source/fallback and transferred-byte diagnostics for this reader.
6. Collect actual aggregate Redis usage, cost and limits before enablement.
   Validate in staging, then compare matched production windows with route
   counts and Neon egress. Keep the timetable pin and QStash schedules. Disable
   only the new reader and purge the data tag to roll back. Evaluate station
   profiles and the schedule-topology reader as later consumers with their own
   snapshot/parity checks; do not inject stale topology into timetable selection.

This milestone targets repeated transfer. Remaining issue, snapshot, metadata,
and arrival queries still touch Postgres; acceptance does not promise suspension.
The broader [egress plan](production-egress-reduction.md) tracks the related
static-topology opportunity.

## Validation and Acceptance

- Run `npm run verify` in `mrtdown-site` for each implementation change.
- Compare SQL and Redis staging responses for a closed incident, an ongoing
  incident, a correction, and an unknown ID. Verify evidence order, affected
  entities, locale rendering, HTML and Markdown, and 404s. Confirm cache
  hits execute zero SQL for the migrated reads and that a completed profile
  refreshes at Singapore midnight.
- Pause a staging pull between promotions, request an uncached issue, and
  verify the fallback cannot populate Redis or the edge. Retry publication
  and purge after an injected failure. Test a Redis timeout, a Fly restart,
  and a cache fill racing publication. Check that disabling the reader
  restores the direct SQL path and that report rate limiting still works.
- Record post-cutover Neon usage and the first observed suspends, if any.
