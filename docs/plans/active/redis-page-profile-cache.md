# Cache public page profiles in Redis

## Purpose

Cache Postgres-built Navigation and completed Issue Profiles in the existing
Redis instance. The site reuses those responses across origin requests to
reduce query work and give Neon longer idle periods. Postgres remains the
relational read model and handles cache misses. Preserve existing URLs,
response shapes, and report behavior.

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
- [ ] Verify an authenticated Cloudflare MISS for staging Navigation.
- [ ] Add cache fills for completed Issue Profiles in staging and verify
  import and retry behavior.
- [ ] Evaluate the Redis pilot in production and decide whether to expand it.

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

## Decision Log

- 2026-11-15, Codex — Pilot Navigation and completed Issue Profiles in the
  existing Redis deployment. Keep Postgres as the relational read model and
  build cache entries from the same public loader data.
- 2026-11-15, Codex — Seed Navigation through the authenticated pull task.
  It takes the existing lease and requires the successful manifest fingerprint,
  which is cleared at the start of live promotion. The publish-only setting
  allows an operator to warm and inspect the key before enabling reads.

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
- `npm run verify` passed 618 tests with local PostGIS. The Cloudflare staging
  hostname redirected to Access login and browser access was unavailable.
  An authenticated `CF-Cache-Status: MISS` remains to be confirmed.

Compare production active time, query counts, and latency after enabling
each reader so the benefits can be attributed to the change.

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
3. Enable readers in production one at a time after staging acceptance.
   Measure Redis hits, SQL fallbacks by route, origin latency, and Redis
   commands, memory, and errors. Compare Neon CU-hours and suspended time
   with the observed continuous-use baseline. Use Cloudflare cache status
   where available to account for changes in origin traffic. Disable the
   cache reader and purge the affected edge response cache to roll back.
   [Issue server function](../../../app/util/issue.functions.ts) ·
   [Request timing](../../../app/server.ts) ·
   [Database timing](../../../app/util/dbQueries/database.ts)
4. If Neon still stays active after the migrated reads fall away, identify
   the routes or jobs that still touch Postgres during potential idle
   periods. Use that evidence and Redis costs to decide whether to extend
   the cache.

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
