# Redis page and service-path rollout, November 15–18, 2026

Navigation, completed Issue Profiles and range service paths were verified in
production. This closes the rollout record; the optional matched service-path
measurement is in [tech debt](../tech-debt.md#measure-incremental-cache-egress).
The broader acceptance target now belongs to [Neon sleep](../active/neon-sleep.md).
These observations do not establish current deployment state or sustained sleep.

## Decisions and findings

The descriptions in this record refer to November 15–18 source and deployment.
Later snapshot paths supersede their request-time SQL and rollout-flag details.

- The pilot reduced egress per response without observed Neon suspension.
  Remaining live reads matter: an open station page refreshes arrivals for
  each branch every 30 seconds, and the arrival API reads SQL with `no-store`.
- The completed Issue Profile validator initially rejected production's empty
  train-car-count arrays, which represent unknown counts. [PR #311](https://github.com/foldaway/mrtdown-site/pull/311)
  restored compatibility and verified cold fills and warm reads.
- Range pages scoped their issue IDs but still reread the entire static network.
  Service paths were the largest measured component; arrivals use a separate
  topology reader and need their own consistency assessment.
- Redis INFO lacked a server run identifier and continuous counters. Aggregate
  usage required the authenticated provider console; key hits and misses do
  not establish route-level cache hit rates.

- 2026-11-15, Codex — Use the existing Redis deployment for Navigation and
  completed Issue Profiles, retaining Postgres as the relational read model.
  Build entries from the public loader data after evidence redaction.
- 2026-11-16, user-approved rollout — Enable both readers in one release window
  with separate rollback flags. Measure their combined effect.
- 2026-11-17, user — End the planned full-day pilot observation and compare the
  available 21 complete hours. Retain the verified readers and attribute
  remaining SQL work before expanding the cache.
- 2026-11-17, follow-up — Cache service-path inputs first for date-range pages.
  Preserve live issue assembly and a coherent SQL snapshot; target transfer
  reduction. Arrival and other live reads remain separate work.
- 2026-11-17, user — Enabled readers may fall back to Postgres while a seed
  generates. Publish-only mode is optional. Keep each reader independently
  reversible and generation marking independent of the reader flags.

## Rollout and measurement evidence

### Navigation and Issue Profile pilot

[PR #309](https://github.com/foldaway/mrtdown-site/pull/309) and
[PR #310](https://github.com/foldaway/mrtdown-site/pull/310) passed staging
checks for SQL parity, cold and warm processes, completed versus live issues,
HTML/Markdown, locales, and 404s. An authenticated staging Cloudflare MISS
served Navigation from Redis. Isolated checks covered partial promotion,
publication races and retries, timeout, midnight expiry, and report limiting.

The initial production rollout required the compatibility fix above. The
[hotfix deployment](https://github.com/foldaway/mrtdown-site/actions/runs/44041894782)
restored both readers at 11:56 p.m. PT on November 16 after an edge purge.
Origin checks on both Machines confirmed SQL-equivalent Navigation and
completed profiles; ongoing issues used SQL with `no-store`, and unknown
issues returned 404. The timetable pin and QStash schedules were preserved.

### Production measurement

The baseline covers 24 hours ending November 16 at 10 p.m. PT. The pilot uses
21 complete hours from November 17, midnight–9 p.m. PT
(`2026-11-17T08:00:00Z` to `2026-11-18T05:00:00Z`).

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

Egress per response fell 22.2% while responses per hour rose 26.8%; egress per
hour fell 1.3%. Latency and compute were broadly unchanged. Keep both readers
enabled, but do not attribute the entire difference to Redis: window lengths
and route mix differ, and the [Station Guide deployment](https://github.com/foldaway/mrtdown-site/actions/runs/44042729265)
overlaps the pilot. Cloudflare cache-status analytics were unavailable with
the existing token. SQL counters identify query families, not HTTP requests.

Provider sources were [Fly monitoring](https://fly.io/apps/mrtdown-site/monitoring)
and the [Neon production branch](https://console.neon.tech/app/projects/crimson-meadow-37625546)
(`br-flat-poetry-a16o0cs4`). Fly response counts sum all statuses and Machines;
latency uses their combined response-time histogram. All byte units here are
decimal. Exact egress totals were 4,722,665,025 and 4,079,482,898 bytes; compute
was 21,594 and 18,912 CU-seconds.

### Follow-up attribution, November 17 PT

Controlled origin GETs and source review on `3b7c849` linked overview/system
map, history, and weekly reports to the same range builder. Each reread 11
static query results: 3,855 rows, including 2,088 service-path rows. Diagnostic
node-postgres JSON measured 683,747 bytes for the static results and 263,893
bytes for paths alone; these are sizing proxies, not wire egress. A supporting
14.5-hour SQL sample returned 5,641,776 rows across 2,702 path-query calls.

[getIssuesOverlappingRange](../../../app/util/dbQueries/issueRange.ts) used
`buildDataset` without a static scope. The station directory adds that builder
when active issues exist; station profiles can also select all 55 revision IDs.
The shared query shape therefore cannot uniquely identify a route.

Arrivals use a separate [live schedule topology reader](../../../app/util/dbQueries/readLiveScheduleTopology.ts)
that reloads 11 topology tables, including paths, in a repeatable-read
transaction. The [station UI](../../../app/routes/{-$lang}/stations/$stationId/components/useStationArrivals.ts)
refreshes each branch every 30 seconds. Caching range inputs leaves this SQL
workload in place and cannot establish a five-minute idle period.

Public statistics and sitemap routes use stored snapshots. Daily canonical
pull, monthly holiday sync, and weekly crowd-report dispatch do bounded
maintenance work. Holiday sync can rebuild facts and purge independently of
a canonical generation. Short request-log samples and statement deltas did
not attribute the full pilot workload or every potential idle period.

### Service-path implementation, November 17 PT

[PR #312](https://github.com/foldaway/mrtdown-site/pull/312) merged as `083cf935`.
It caches only service-path inputs for overview/system map, history/day, and
weekly reports. All participating SQL reads share one read-only repeatable-read
snapshot; cached paths must match its completed generation. Missing, invalid,
unavailable, or in-progress cache state falls back to SQL with `no-store`.

The entry is capped at 512 KiB with 24-hour retention and one five-minute
process memo. Publication, unchanged-manifest renewal, standalone seeding,
flags, diagnostics, and rollback are documented in the [service-path runbook](../../operations/edge-caching.md#service-path-inputs).

Local `npm run verify` passed all 657 tests with PostGIS. Focused integration
checks established range parity, SQL fallback during partial promotion, and
coherent snapshots across correction/publication. Built-app checks with real
Redis verified byte-identical HTML across the four route families, zero path
SQL on hits, and uncached SQL fallback for missing, malformed, oversized, and
unavailable entries.

Staging first served a successful SQL fallback with reads enabled, then seeded
without advancing generation. Both Machines subsequently served cached history
responses with public cache headers. The [merge-triggered staging deployment](https://github.com/foldaway/mrtdown-site/actions/runs/44255825760)
passed; the timetable pin and schedules were preserved.

### Service-path production rollout, November 17–18 PT

The user-approved [production deployment](https://github.com/foldaway/mrtdown-site/actions/runs/44262574577)
fast-forwarded `production` from `3b7c849` to `083cf935`. Both Singapore
Machines reached Fly release 84 with all three readers enabled. The approved
GitHub/live timetable pin remained unchanged, as did all three QStash schedule
configurations, cron expressions, and unpaused states.

Seed `wfr_Of-gtluM5VkgBnACvE-Ky`, requested at `2026-11-18T07:58:41Z`,
succeeded without advancing generation `wfr_ao68-GdbHPYUPAL1tNaTo`. SQL,
Navigation, and the new path entry agreed on that generation. The entry held
2,088 rows in 263,955 bytes with 24-hour retention. The canonical fingerprint
was present, topology promotion complete, and pull lease clear.

Cloudflare accepted the `mrtdown-production-data` purge at
`2026-11-18T08:00:01Z` (November 18, midnight PT). A forced-origin
`/history/2026/10` on each Machine returned 200 with public cache headers.
Following production traffic logged `service_path_cache_read` with source
`memory` and zero Redis payload bytes on both Machines. These checks establish
successful caching and local reuse; provider-level effects remain to be measured.

#### Measurement handoff

The pre-cutover baseline contains 23 complete hourly buckets:
`2026-11-17T08:00:00Z` to `2026-11-18T07:00:00Z` (November 17,
midnight–11 p.m. PT). It excludes both rollout hours. Sources and metric
conventions are the same as the pilot comparison above.

| Metric | Pre-cutover, 23 hours |
| --- | ---: |
| Fly app responses | 20,359 |
| Fly app median | 124.6 ms |
| Fly app p95 | 949.1 ms |
| Neon public egress | 4,373,572,461 bytes (4.374 GB) |
| Neon egress per app response | 214.8 KB |
| Neon compute | 20,712 CU-seconds (5.753 CU-hours) |

Compare matched complete hours beginning `2026-11-18T08:00:00Z`; exclude the
mixed `07:00–08:00Z` cutover hour. Normalize egress by Fly app responses and
consider route mix, volume, p95, Redis commands/bandwidth/cost, and source/fallback
logs. Live arrival and issue reads still touch Postgres; suspension is not an
acceptance condition.

### Redis aggregate usage and cost, November 17 PT

The authenticated [production Redis console](https://console.upstash.com/flyio/redis/e8baa613-a354-42a2-8505-a800f7f12201/usage?period=1d)
for Fly-managed `mrtdown-production` in Singapore showed the following before
the service-path rollout. Usage includes the shared report limiter and diagnostics.

| Item | Observed value |
| --- | --- |
| Plan | Pay as you go, $0.20 per 100,000 commands |
| Console summary | About 19K commands, 143 MB bandwidth, $0.04 cost |
| Stored data / allowance | 15 MB / 10 GB |
| Commands/second limit | 10,000 |
| Monthly command and bandwidth allowances | Unlimited in the subscription table |
| Configured budget | $360 |
| November 17 UTC daily bar | About 16K commands, 121 MB bandwidth, $0.03 |
| November 18 UTC partial daily bar | About 2.8K commands, 22 MB bandwidth, $0.01 |
| Past-day throughput | Mean displayed bin 0.216 commands/second; highest 4.484 |
| Past-day connections | TCP 1–2; REST zero |
| Eviction / Lua strict key locking | Enabled / off |

This cleared the practical usage/cost gate for the bounded rollout. Daily bars
use UTC; the top summary did not identify its accounting-period boundaries.
Throughput bins were about 24 minutes, masking instantaneous peaks. No error
or rate-limit series or explicit connection cap was exposed. These rollups
cannot establish exact incremental cache cost, route hit rates, or limiter
reliability. No provider settings were changed during inspection.

## Current ownership

The [cache runbook](../../operations/edge-caching.md) owns configuration, repair
and fallback. Historical flag instructions above describe the rollout era; those
switches have since been retired. [Original full plan](https://github.com/foldaway/mrtdown-site/blob/fdf2a7b8effd7916f85c7e990b8b50ed7540fc96/docs/plans/active/redis-page-profile-cache.md)
preserves the superseded milestone instructions and acceptance gates.
