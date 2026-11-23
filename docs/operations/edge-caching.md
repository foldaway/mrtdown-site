# Cloudflare Edge Caching

Cloudflare proxies the public Fly.io hostnames and caches selected public SSR,
Markdown, and sitemap responses. The application owns freshness headers and
cache tags; Cloudflare Cache Rules make dynamic response paths eligible.

## Response Contract

Successful cacheable responses emit:

```http
Cache-Control: public, max-age=0, must-revalidate
Cloudflare-CDN-Cache-Control: public, max-age=900, stale-while-revalidate=300, stale-if-error=86400
Cache-Tag: mrtdown-<tier>-data
X-MRTDown-Cache: public-<kind>
```

Browsers revalidate instead of retaining stale public data. Cloudflare may
serve a response as fresh for 15 minutes, serve stale while asynchronously
revalidating for 5 minutes, and retain stale content for origin failures. The
event-driven purge described below normally invalidates changed data before
those limits are reached.

The small origin helper in `app/util/publicResponseCache.ts` applies this
contract to successful `GET` and `HEAD` HTML or Markdown responses and to a
successfully generated sitemap. It respects `Set-Cookie`, `private`, and
`no-store` opt-outs. Route eligibility belongs exclusively to the Cloudflare
Cache Rule below.

Station profile HTML and its client navigation response use up to one hour at
the edge, ending sooner at the next Singapore midnight, incident transition,
or community signal expiry. Cloudflare must revalidate at expiry, including
during origin errors. Station departures load after hydration through a separate
`no-store` API.

## Required Cloudflare Rules

Create a Cache Rule for each proxied application hostname with these logical
conditions:

- Method is `GET` or `HEAD`.
- Path is `/`, `/about`, `/statistics`, `/system-map`, `/history` and its
  descendants, or a public `/issues/*`, `/lines/*`, `/operators/*`, or
  `/stations/*` profile, including locale-prefixed variants; or `/reports/weekly`
  and its dated reports, including locale-prefixed variants; or it is a
  canonical `index.md` route, `/llms.txt`, or `/sitemap.xml`.
- Or it is `/_serverFn/*` with request header `X-TSR-ServerFn: true`, or the
  public `GET /api/issues-day` endpoint. Keep the default cache key, including
  the query string, so server-function inputs and day parameters stay distinct.
- Requests to an HTML URL whose `Accept` header explicitly prefers
  `text/markdown` are bypassed. Those requests intentionally reach the origin
  and receive `406`; canonical Markdown URLs remain eligible.

Explicitly exclude `/report`, `/community-reports/*`, `/internal/*`,
`/healthz`, and every `/api/*` endpoint other than `GET /api/issues-day`.

Set **Cache eligibility** to **Eligible for cache**, and configure Edge TTL to
respect the origin cache-control header. Do not create a blanket "cache
everything" rule for `/api/*` or `/internal/*`.

Cloudflare does not cache dynamic HTML merely because the DNS record is
proxied. The eligibility rule is required. `Cloudflare-CDN-Cache-Control`
separates edge freshness from the browser-facing `Cache-Control` policy.

## Invalidation

The canonical pull publishes updated data in this order:

1. Promote staged canonical data.
2. Rebuild operational facts plus the statistics and sitemap snapshots.
3. Mark the page-profile generation complete and publish Navigation to Redis
   when either page-profile cache is configured.
4. Purge `mrtdown-<tier>-data` through the Cloudflare API.
5. Record the successful manifest fingerprint and release the pull lease.

Each Fly process reads the same Redis Navigation entry. A miss or a Redis
failure falls back to Postgres and marks the response `no-store` when the
reader is enabled. The last completed generation stays available while the
next canonical pull runs.

Public-holiday changes use the same publication sequence. Successful crowd
report submissions and successful cluster dispatches also purge the tag because
public signals appear on cached home, line, and station pages. A crowd-report
purge failure is logged after commit. The edge TTL bounds how long those cached
responses can stay fresh.

Configure these server-only Fly secrets before enabling the Cache Rule:

```text
CLOUDFLARE_ZONE_ID
CLOUDFLARE_CACHE_PURGE_TOKEN
```

The API token should be scoped to the application zone with only the
`Cache Purge` permission. Preview, staging, and production publication steps
fail if either value is missing, so a deployment cannot silently claim that it
published fresh cached data. Local development logs and skips invalidation.

## Redis Navigation Bootstrap

Set `REDIS_NAVIGATION_CACHE=publish` on the target Fly app and use the
existing `REDIS_URL`. Send an authenticated `POST /internal/api/tasks/pull`
with `{"seedNavigationCache":true}`. The workflow takes the canonical pull
lease and requires the successful manifest fingerprint before it builds
Navigation from Postgres. It can seed the key even if a scheduled pull
would skip an unchanged manifest. Wait for the workflow to complete and
confirm it published `mrtdown:<tier>:page-profiles:v1:navigation`.

Set `REDIS_NAVIGATION_CACHE=enabled` and purge the tier's Cloudflare data tag
after the new configuration is serving traffic. A staging origin fill reports
`X-MRTDown-Navigation-Source: redis` when it serves Navigation from Redis and
`sql` when it falls back. Check the header on a Cloudflare `MISS` because an
edge hit replays the origin fill's header. To roll back, unset
`REDIS_NAVIGATION_CACHE` and purge the tier's data tag. Seed again before
re-enabling the reader if a pull ran while publication was disabled.

## Completed Issue Profiles

Enable `REDIS_ISSUE_PROFILE_CACHE=enabled` after seeding Navigation on the
same deployed revision. The seed task also records the active generation in
Postgres. Keep `REDIS_NAVIGATION_CACHE` on its own setting for targeted
rollback. With Issue Profile caching enabled, the pull publishes the shared
generation and Navigation value.

An Issue Profile with ended intervals can fill Redis only when a
repeatable-read Postgres snapshot sees the published generation marked
complete. The pull marks it updating with the first live canonical write.
Reads use `MGET` to fetch the active generation and profile atomically. A
conditional Redis write prevents delayed fills from publishing after the
generation advances. Entries are limited to 128 KiB and expire at Singapore
midnight. Cache hits can populate Cloudflare for up to 15 minutes, capped at
the same midnight.
SQL responses bypass shared caching while the reader is enabled.

On staging origin requests, check `X-MRTDown-Issue-Profile-Source`. A cold
completed issue returns `sql` with `no-store`, then returns `redis` on the
next origin request. HTML and Markdown share a Redis entry. For rollback,
unset `REDIS_ISSUE_PROFILE_CACHE` and purge the tier's data tag.

## Range-reference inputs

`REDIS_RANGE_REFERENCE_CACHE` enables reference reuse for overview/system map,
history/day, issues-day, and weekly-report range readers. The default is SQL;
`publish` enables publication only, and `enabled` adds reads. It operates
independently of the service-path and page-profile flags.

After deploying with the existing timetable pin, use the authenticated pull
task with `{"seedRangeReferenceCache":true}` to publish the current completed
generation. This seed requires a completed canonical fingerprint, takes the
pull lease, and neither imports data nor advances generation. Keep seeds
separate from other seed/import options. Reads may be enabled while seeding;
misses use SQL with `no-store`. Purge the tier's data tag after enabling reads.

The versioned key is
`mrtdown:<tier>:range-references:v1:<generation>`. Its seven projected row sets
are lines, line operators, services, revisions, stations, station codes, and
station-landmark relationships. Unused lookup dictionaries and metadata are
omitted from range assembly. Holidays remain a date-only SQL read; issues,
events, evidence, and rider reports remain live. Paths reuse their existing
separate entry. Arrival and entity-profile readers are unchanged.

Each enabled range read obtains the SQL generation once in a read-only
repeatable-read transaction shared by both cache readers and all range SQL.
Each entry must match that completed generation. Missing, incomplete, invalid,
oversized, or unavailable entries use SQL in the same snapshot with `no-store`.
The reference entry has a 512 KiB JSON ceiling, bounded `GETRANGE`, 24-hour
retention, one five-minute decoded process memo, and one shared in-flight load.
Rows are copied for each request; branch/revision selection stays request-time.

Pulls publish after generation completion and before edge purge/fingerprint
completion, including Navigation seeds that advance generation. Unchanged
manifests renew identical reference contents. Same-generation retries compare
row sets, preserving the first publication's table-row order; different data
fails publication. Redis failures retry the workflow. Oversize entries stay on
SQL. Holiday sync/manual refresh needs no reference invalidation because dates
stay in SQL. Facts/statistics/sitemap rebuilds do not change this generation.
Canonical reference repairs must mark updating before writes, complete a new
generation, republish, and purge; a seed cannot replace changed contents under
an existing generation.

Staging exposes `X-MRTDown-Range-References-Source` (`redis`, `memory`, `sql`).
`range_reference_cache_read` logs source, range, and attributed payload bytes;
`range_reference_cache_transfer` records bytes received, including rejected
entries. A shared read attributes payload bytes once. Verify response parity,
zero seven-table reference SQL on hits, SQL holiday/live-issue reads, both flag
combinations, and coherent fallback. Disable only `REDIS_RANGE_REFERENCE_CACHE`
and purge the data tag to roll back. Measure provider egress/latency and Redis
usage over matched windows after a separately authorized production enablement.

## Service-path inputs

`REDIS_SERVICE_PATH_CACHE` controls path reuse for overview/system map,
history/day, and weekly-report range readers. The default is direct SQL.
`publish` enables pull publication only; `enabled` also enables reads. This
setting is independent of Navigation and completed Issue Profiles.

Deploy with the existing timetable pin. Reads may be `enabled` immediately:
cache misses use Postgres while the seed runs. `publish` mode is also available
when inspecting an entry before enabling reads. After confirming a successful
canonical fingerprint, trigger the authenticated pull task with
`{"seedServicePathCache":true}`. The task takes the pull lease and publishes
paths for the current completed SQL generation. It does not import data,
advance the generation, or republish other caches. Do not combine a seed with
other seed or timetable inputs. Confirm the workflow releases its lease.

Entries use `mrtdown:<tier>:service-paths:v1:<generation>` and contain only
path columns, with a 512 KiB JSON ceiling and 24-hour Redis retention. Successful
pulls publish before the edge purge and fingerprint completion. An unchanged
manifest renews identical path data's retention without advancing the generation
or purging. Different contents under the same generation fail publication.
Oversize data remains on SQL; Redis publication failures retry the workflow.

Each enabled range read uses one read-only repeatable-read SQL snapshot for
generation, issue discovery, revisions, and assembly. Only matching completed
generations can reuse paths. Missing, invalid, oversized, or unavailable entries,
and incomplete promotion, fall back through that snapshot with `no-store`.
The process retains at most one decoded entry for five minutes and shares one
in-flight load. Returned rows are copied so assembly cannot mutate the memo.
SQL generation validation still runs on every request. Other range references
can use the independent [reference reader](#range-reference-inputs); live
intervals, holidays, and rider reports stay on their existing paths.

Purge the tier's data tag after the enabled setting is serving traffic.
Staging responses expose `X-MRTDown-Service-Paths-Source` as `redis`, `memory`,
or `sql`. Structured `service_path_cache_read` logs record source, range, and
attributed Redis payload bytes; a shared load attributes bytes to its initiating
request. `service_path_cache_transfer` logs record actual received payload bytes,
including rejected values. A bounded `GETRANGE` caps each read at the size
ceiling plus one byte. Failed commands have no measured response-byte total.

Verify the four route families against SQL, an empty range, a correction,
publication crossing a read, and a cold process. Warm hits must execute zero
dataset path queries. Station profiles and arrivals retain their current SQL
readers. To roll back, unset only `REDIS_SERVICE_PATH_CACHE` and purge the data
tag. Production enablement still requires the aggregate usage evidence below.

## Published zero-SQL range inputs

`REDIS_RANGE_SNAPSHOT` accepts `publish` (writer only), `enabled` (writer and
reader), or unset (disabled). This is a separate opt-in path from the reference
and service-path caches. It serves canonical range assembly for history,
issues-day, overview/map and report range inputs. Optional community signals,
weekly archive/sitemap reads, entity profiles and arrivals still have their
existing SQL dependencies; this flag alone cannot make the entire site sleep.

The producer loads canonical source rows from one read-only repeatable-read
snapshot after page-profile completion. It excludes evidence bodies and rider
reports. The consumer validates the encoding, digest and row schemas, selects
latest-period candidates and assembles using the request's clock. Time passing,
including midnight or an issue ending, does not need SQL or republication.

Redis keys use `mrtdown:{<tier>:range-snapshot:v1}` (one cluster hash slot):
`active` names an immutable
`payload:<sha256>` containing gzip/base64 canonical input rows. Limits are
4 MiB encoded and 24 MiB expanded JSON. The payload and pointer commit in one
atomic compare-and-swap operation. Each head has a unique publication ID, so
a delayed producer must retry even if the inputs changed and then changed back.
Readers keep using the last completed snapshot throughout
an import. The active pointer and payload have no TTL; superseded
payloads expire after 24 hours. Each process memoizes one decoded payload but
checks the active pointer in Redis on every read. Cold processes use Redis,
not a SQL generation check. A missing/invalid/unavailable snapshot uses SQL
with `no-store`; requests never publish replacements.

A `completed` fingerprint is recorded only after canonical publication, purge
and the SQL fingerprint succeed. With reads enabled, unchanged scheduled pulls
fetch upstream metadata and validate this external checkpoint and payload
before acquiring a SQL lease. Missing payloads/checkpoints or changed inputs
take the normal writer/recovery path. Reviews, rebuilds and explicit seeds
always retain that path. Publish-only mode retains existing renewal behavior.
Writers clear the checkpoint before import or projection work can mutate SQL,
while retaining the serving snapshot. A failed rebuild therefore cannot stop
the next ordinary poll from reaching SQL recovery.
Failure cleanup uses a short-lived external writer marker to avoid opening SQL
when an upstream-only preflight failed before lease acquisition.

When publication is enabled, every holiday workflow run republishes before
purging, even if the holiday rows are unchanged. This retries publication or
purge failures after an earlier sync committed, without a separate dirty marker.
The publisher reads both completion metadata and source rows in the same
repeatable-read transaction; an updating canonical generation is rejected.
Manual facts rebuilds do not change its canonical source inputs. Canonical SQL
repairs must complete promotion and republish before considering the change
public; direct unsupported writes are not made fresh by a reader TTL.

For rollout, deploy with the flag unset, then set `publish` and run the normal
authenticated pull. Unchanged inputs repair the snapshot without importing or
advancing generation. Validate payload size and cold/warm SQL parity in staging,
then enable reads and purge the public data tag. Staging exposes
`X-MRTDown-Range-Snapshot-Source`; structured `range_snapshot_read` events report
`redis`, `memory` or `sql` and payload bytes. Verify zero SQL for canonical
range hits and for unchanged scheduled pulls, including failure cleanup.
Rollback by unsetting only this flag and purging the data tag; existing SQL and
reference/path readers remain available. A successful local check does not
establish production sleep; use the [sleep plan](../plans/active/neon-sleep.md)
for remaining wake-ups and eventual provider-level acceptance.

## Published arrival metadata

`REDIS_ARRIVAL_SNAPSHOT=publish` publishes admission history, attested canonical
topology, projection headers, coverage days/scopes and display names during a
completed pull. Unset disables it. Public serving is controlled separately by
`REDIS_ARRIVAL_READS`; publishing alone leaves arrivals on SQL.

The publisher captures these inputs together in a read-only repeatable-read
transaction. It verifies the topology attestation and retained admission chain,
and rejects an incomplete projection for the current topology. Publication uses
the same bounded gzip/base64, unique publication ID and atomic head swap as the
range snapshot, under `mrtdown:{<tier>:arrival-inputs:v1}`. Active data has no
TTL. The separate namespace leaves range-reader rollback independent.

Bounds are 100 retained versions/projection headers, 10,000 day rows, 100,000
scope rows, 4 MiB encoded and 24 MiB expanded JSON. A bound violation fails
publication and preserves the preceding head; rows are never truncated into a
valid snapshot. November 22 production sizing found 53,680 scopes and 44 days
across two projections. This is sizing evidence, not a production publication.

For a separate staging rollout, deploy with the flag unset, then configure
`publish` and send an authenticated empty pull. Even when the range checkpoint
is current, missing/invalid arrival metadata forces the normal SQL repair path.
Both snapshots must publish before purge and checkpoint completion. A healthy
snapshot with the same generation and fingerprint preserves the SQL-free
unchanged-pull path. Check `arrival_inputs_published`, payload size and a cold
validated read before considering the separate serving flag below. Unset this
flag to stop publication; reader activation remains independent.

## Published departure partitions

`REDIS_ARRIVAL_DEPARTURES=publish` requires `REDIS_ARRIVAL_SNAPSHOT=publish`.
Both default off. This publishes compact station/projection partitions.
Explicit source dates, shared memberships, platforms,
unknown timing and overnight offsets are retained.

The pull publishes one station per durable step, then atomically activates a
manifest tied to the arrival metadata. Purge and checkpoint completion follow.
Limits are 1,000 partitions, 20,000 distinct calls per partition, 8 MiB expanded
and 2 MiB encoded per partition, and 64 MiB total encoded partitions. Failures
preserve the previous manifest. Active parts persist; pending and retired parts
expire after 24 hours. Restart the pull if pending parts expire before activation.

For staging validation, deploy with flags unset, enable both producers and
trigger an authenticated empty pull. Check `arrival_departures_published`, total
bytes and publication latency; repeat the unchanged pull and confirm it finishes
before SQL lease acquisition. Production table/index sizing was about 1.7 GB;
compressed payload size and staging latency remain unmeasured. Validate both
before production publication. Unset the departure flag to stop its producer.
The [Neon sleep plan](../plans/active/neon-sleep.md#arrivals-follow-up) tracks
rider-report caching and public serving separately.

## Recent arrival reports

`REDIS_ARRIVAL_REPORTS` defaults off. `publish` refreshes Redis after accepted
SQL submissions; `enabled` also lets report reads use it. Non-platform report hits, empty
results and clock expiry use no SQL. SQL-backed schedule requests retain report
SQL fallback; published schedule requests omit missing/unavailable reports. A missing or dirty report input gets one bounded repair attempt on
that request. Missing topology falls back without repairing reports.

Before enabling reads, run `publish` on **every report writer**, drain old
instances, and republish arrival metadata with revision recency. Seed with
`repairArrivalReportCache(db)` from
[`crowdArrivalReportCache.server.ts`](../../app/util/crowdArrivalReportCache.server.ts),
or let the first enabled read initialize it. Repair loads at most 10,000 recent
accepted rows; exceeding the bound keeps SQL fallback. There is no timer or
expiry refill. The cache contains no reporter identities. Apply the generated
nullable `destination_station_id` migration before deploying the updated report
writer.
Each new report preserves its validated destination through SQL and Redis;
mismatched or legacy rows without that identity are omitted from cached reads.
No destination is backfilled from potentially changed topology.

Redis invalidation failure rejects a submission before insertion. Publication
failure after commit preserves the accepted report and leaves the cache unknown
until repair. Writers and repairs share a SQL lock; Redis WATCH/MULTI rejects
delayed publishers. Readiness and scopes share one hash so eviction stays unknown.

Rollback reads to `publish` first. Turn publication off only after all enabled
readers have drained. Reseed before re-enabling after any writer ran without
publication, direct SQL report edits, or a Redis restore. No flags were enabled
as part of this implementation; staging measurement and full public serving
remain separate gates.

## Published arrivals reader

`REDIS_ARRIVAL_READS=enabled` opts the public v2 endpoint into published inputs.
It defaults off and does not enable either producer. The reader requires metadata
and a departure manifest with matching generation, fingerprint and metadata
payload digest. It reads only the selected station/projection partitions, with
bounded decoding and digest/identity checks. Selection, Singapore service dates
(including 24+ hour tails), display labels and limits use the SQL path's shared
policy and assembly code at the request clock. Empty or incomplete coverage is a
normal response, distinct from an unavailable required snapshot.

Missing, mismatched or corrupt required inputs select SQL recovery lazily. A
cached scope rejection checks SQL's completed generation: a changed or updating
generation selects SQL validation, covering newly promoted platforms before
snapshot publication. A matching generation retains the cached 400. Valid scopes
never perform this generation check. No request-side departure publication or
repair is attempted. With a healthy publication, neither a cold process nor
midnight needs SQL. Branch-level reports
use `REDIS_ARRIVAL_REPORTS=enabled` and the same metadata snapshot; expiry and
initialized-empty reports remain SQL-free. Disabled, dirty or unavailable optional
reports are omitted on this path, leaving the timetable usable. Writers or an
explicit report seed restore missing signals. Platform queries omit reports.

Keep public reads off until the publish-only staging payload-size and latency
gates above pass. Then compare cold/warm v2 responses against SQL, including
empty coverage, midnight and report expiry, before a separate activation decision.
Rollback by unsetting `REDIS_ARRIVAL_READS`; producers can remain in `publish`.
No deployment or flags were changed by the reader implementation. Other public
profiles, sitemap/statistics and background readers still independently wake SQL;
this endpoint alone does not establish production-wide Neon sleep.

## Redis usage evidence

Use the configured database's Upstash Usage and billing views, or the
[management stats API](https://upstash.com/docs/devops/developer-api/redis/get_database_stats),
for aggregate commands, billing, throughput, connections, and hit/miss series.
Record the database identity, plan, limits, time zone, and sampling boundaries.
Include the crowd-report limiter when assessing shared capacity. Database REST
or Redis connection credentials do not establish management API access.

Treat Redis INFO as diagnostic point evidence unless server identity and
counter continuity are established. A missing run identifier, decreasing
counter, or inconsistent fields prevents a trustworthy window delta. Memory
alone cannot establish command headroom, cost, or a reader's hit rate. See the
[production cache plan](../plans/active/redis-page-profile-cache.md#redis-aggregate-usage-and-cost-november-17-pt)
for the latest account-level evidence and its sampling limits.

## Verification

After deploying a change to station profiles, purge the tier's data tag once
the new app is serving traffic. Include a station profile when checking HTML.

1. Request a representative HTML, Markdown, and sitemap URL twice.
2. Confirm the first response is `MISS` and the second is `HIT` or `UPDATING`.
3. Confirm cached responses expose `Age` and the expected
   `X-MRTDown-Cache` value.
4. Run a pull containing a known issue update.
5. Confirm the next request is `MISS` and contains the updated data.

Cloudflare removes `Cache-Tag` before sending the response to visitors. Use
Cloudflare Trace or inspect the direct origin response when validating tags.

## Weekly Reports

Only completed Singapore-time weeks are served. The current week returns 404
until the following Monday at 00:00 SGT, and is absent from the archive and
sitemap. Completed report HTML uses a 30-day Cloudflare TTL with one day of
stale-while-revalidate; archives use one hour with five minutes of revalidation.
Both retain the shared data cache tag, so canonical ingest purges corrections.
Browser responses still require revalidation. Errors, cookies and private or
no-store responses remain excluded from shared caching.

Add these paths to the deployed **Eligible for cache** rule, preserving the
existing method, Accept-header and origin TTL settings. The report-path clause
can use this Cloudflare expression (expand it if adding another locale):

```text
(http.request.uri.path eq "/reports/weekly" or
 starts_with(http.request.uri.path, "/reports/weekly/") or
 http.request.uri.path eq "/en-SG/reports/weekly" or
 starts_with(http.request.uri.path, "/en-SG/reports/weekly/") or
 http.request.uri.path eq "/zh-Hans/reports/weekly" or
 starts_with(http.request.uri.path, "/zh-Hans/reports/weekly/") or
 http.request.uri.path eq "/ms/reports/weekly" or
 starts_with(http.request.uri.path, "/ms/reports/weekly/") or
 http.request.uri.path eq "/ta/reports/weekly" or
 starts_with(http.request.uri.path, "/ta/reports/weekly/"))
```

Respect origin TTL; do not override error responses with an edge TTL. Keep the
existing `/_serverFn/*` rule as well: client navigation uses GET server functions.
After deployment, request a report twice and verify `CF-Cache-Status: HIT` on
the second request and `Age` increasing. A local origin response cannot verify
Cloudflare eligibility. Check the archive after the Monday boundary too; it may
remain cached for up to an hour unless an ingest purge refreshes it sooner.
