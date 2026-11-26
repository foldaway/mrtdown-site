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
3. Mark the page-profile generation complete and publish Navigation, range,
   sitemap and arrival inputs when Redis is configured. Activate the matching
   departure manifest before purging.
4. Purge `mrtdown-<tier>-data` through the Cloudflare API.
5. Record the successful manifest fingerprint and release the pull lease.

Each Fly process reads the same Redis Navigation entry. A miss or a Redis
failure falls back to Postgres and marks the response `no-store` when Redis
is configured. The last completed generation stays available while the
next canonical pull runs.

Public-holiday changes republish range inputs before purging. Successful crowd
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

With `REDIS_URL` configured, cache reads and publication run automatically.
Local development without Redis uses SQL. Rollout mode flags are no longer
supported; repair missing inputs or revert the application revision when needed.
Keep Redis configured consistently across writers and readers.

Send an authenticated `POST /internal/api/tasks/pull` with
`{"seedNavigationCache":true}` to repair publications without importing data.
The workflow takes the canonical pull lease, requires a successful fingerprint,
and completes a new shared generation before publishing all cache families.
It activates matching departure inputs before purging the tier's data tag.

A staging origin fill reports `X-MRTDown-Navigation-Source: redis` or `sql`.
Check on a Cloudflare `MISS`; an edge hit replays the origin fill's header.
Missing or unavailable navigation falls back to SQL with `no-store`.

## Published Issue Profile inputs

With Redis configured, full HTML, Markdown and server-function Issue Profile
reads use published source inputs, including cold requests and ongoing/future
issues. Assembly uses the request clock for intervals, inferred ends, duration
and date-selected service revisions. Midnight does not refill SQL. Completed
profiles retain the midnight freshness deadline and 15-minute edge cap;
ongoing/future profiles remain `no-store`. Before setting edge cache headers, the
server rechecks the publication ID in Redis after rendering. Superseded or
unverifiable responses retain their coherent view with `no-store`.

Keys use `mrtdown:{<tier>:issue-profiles:v1}`. A bounded topology/partition
manifest (4 MiB encoded, 24 MiB JSON) references at most 10,000 immutable issue
partitions (512 KiB encoded, 2 MiB JSON each, 32 MiB total encoded). Partitions
contain only assembly rows, static scope and public update projections. Redacted
text/translations and unused title metadata are excluded. Evidence keeps descending
timestamps with an ID tie-breaker. The existing atomic head/dependency check
activates all parts together, rejects delayed publishers and retains the last
completed publication during import. Active parts persist; superseded parts
expire after 24 hours.

Canonical pulls publish after generation completion, before purge/checkpoint.
This covers topology changes, evidence updates/redaction, issue corrections and
deletions. Holiday/facts rebuilds do not change these scoped inputs. Unchanged
pulls verify the manifest and every partition before skipping SQL; missing or
invalid inputs enter the normal leased repair path. The Navigation seed above
also repairs this publication. Requests never publish replacements.

Missing, corrupt or unavailable inputs recover through read-only repeatable-read
SQL with `no-store`. IDs absent from the manifest also recover through SQL, so a
newly promoted ID cannot be hidden by an older publication or a negative cache.
On staging, `X-MRTDown-Issue-Profile-Source` reports `redis` or `sql`, independently
of edge eligibility. Deployment and production sleep verification remain separate.

## Range-reference inputs

The reference cache remains part of SQL recovery when the complete published
range snapshot is unavailable. Its seven projected row sets cover lines, line
operators, services, revisions, stations, station codes and station landmarks.
Holidays and live issue inputs remain SQL reads on that recovery path.

Use `{"seedRangeReferenceCache":true}` on the authenticated pull task to repair
the current completed generation under the pull lease. It requires a completed
canonical fingerprint and neither imports nor advances generation. Keep seeds
separate from other seed/import options.

Entries use `mrtdown:<tier>:range-references:v1:<generation>`. Each must match the
completed generation read in the same repeatable-read transaction as recovery
SQL and service paths. Missing, incomplete, invalid, oversized or unavailable
entries use SQL in that snapshot with `no-store`. The entry has a 512 KiB JSON
ceiling, bounded `GETRANGE`, 24-hour retention, one five-minute decoded process
memo and one shared in-flight load. Returned rows are copied.

Pulls publish after generation completion and before purge/fingerprint completion.
Same-generation retries compare row sets while preserving the first row order;
different data fails publication. Oversize entries stay on SQL; Redis failures
retry the workflow. Canonical reference repairs must mark updating before writes,
complete a new generation, republish and purge. A seed cannot replace changed
contents under an existing generation.

Staging exposes `X-MRTDown-Range-References-Source` (`redis`, `memory`, `sql`).
`range_reference_cache_read` records source and attributed bytes;
`range_reference_cache_transfer` includes rejected payloads.

## Service-path inputs

Service paths also remain a consumer of the completed generation during SQL
range recovery. Station profiles and other direct SQL readers keep their own
paths. Use `{"seedServicePathCache":true}` on the authenticated pull task to
repair the current completed generation under the pull lease, without importing,
advancing generation or republishing other caches. Keep seeds separate.

Entries use `mrtdown:<tier>:service-paths:v1:<generation>`, with a 512 KiB JSON
ceiling, bounded `GETRANGE` and 24-hour retention. Successful pulls publish before
purge/fingerprint completion. Same-generation different contents fail publication.
Oversize data remains on SQL; Redis publication failures retry the workflow.

Recovery uses a read-only repeatable-read transaction for generation, issue
selection and assembly. Missing, invalid, oversized or unavailable entries and
incomplete promotion fall back through that snapshot with `no-store`. The process
retains one decoded entry for five minutes and shares one in-flight load. Returned
rows are copied. Warm matching entries eliminate dataset path queries.

Staging exposes `X-MRTDown-Service-Paths-Source` (`redis`, `memory`, `sql`).
`service_path_cache_read` attributes a shared load's bytes to its initiating
request; `service_path_cache_transfer` includes rejected payloads.

## Published zero-SQL range inputs

With Redis configured, history, issues-day, overview/map and report range inputs
select a completed snapshot before any SQL connection or generation read.
Other entity profiles/directories and disruption dispatch still have SQL
dependencies; this does not establish sustained whole-site Neon sleep.

The producer reads canonical rows in one repeatable-read transaction after
page-profile completion. It excludes evidence bodies and rider reports. Consumers
validate encoding, digest and row schemas, then select latest-period candidates
and assemble at the request clock. Midnight and issue endings need no refill.

Keys use `mrtdown:{<tier>:range-snapshot:v1}`. The `active` pointer names an
immutable `payload:<sha256>` of gzip/base64 source rows, limited to 4 MiB encoded
and 24 MiB expanded JSON. Atomic compare-and-swap uses a unique publication ID
to reject delayed producers, including changes that later revert. The last
completed snapshot remains readable during import. Active keys persist;
superseded payloads expire after 24 hours. Each process memoizes one decoded
payload and checks the pointer on every read. Missing/invalid/unavailable inputs
use SQL with `no-store`; requests never publish replacements.

The external `completed` fingerprint follows all publications, purge and the SQL
fingerprint. Unchanged pulls validate upstream metadata, payloads and coherent
range/sitemap/arrival/station heads before acquiring a SQL lease. Changed or explicit
inputs and missing state keep the writer/repair path. Writers invalidate the
checkpoint before import or rebuild mutations. An external writer marker keeps
preflight failure cleanup from opening SQL before lease acquisition.

Holiday runs republish before purging unless the holiday preflight proves a
completed unchanged source. Manual facts rebuilds do not change range inputs.
Canonical SQL repairs must complete promotion and republish. An authenticated
empty pull repairs unchanged inputs without importing or advancing generation.
Check `X-MRTDown-Range-Snapshot-Source` and `range_snapshot_read` for source and
bytes; verify cold/warm parity and zero SQL on healthy hits.

## Published station profile inputs

With Redis configured, station HTML, server functions and Markdown resolve IDs
and aliases from `mrtdown:{<tier>:station-profiles:v1}` before opening SQL.
One source graph supplies scoped profile assembly at the request clock. The
range payload is unchanged. Station inputs add towns, landmarks, platforms,
exits and historical issue references; operators and evidence bodies are omitted.
Community disruption signals remain independently published and expire through
the existing signal reader.

The shared immutable store caps the graph at 4 MiB encoded and 24 MiB expanded
JSON, logs `station_profiles_published` bytes, checks digest/schema on cold reads,
and checks the active head on every request. Its atomic compare-and-swap and
24-hour previous-payload retention keep crossing reads coherent and reject
delayed writers. Publication requires a completed canonical generation.
Canonical and holiday workflows publish before purge and completion; unchanged
preflights verify the payload and matching generation/fingerprint.

Missing, invalid or unavailable inputs use SQL with `no-store`. Requests do not
publish replacements. Use an authenticated empty canonical pull to repair, then
verify a cold and warm profile/code alias against SQL in an isolated environment.
Station HTML and server-function response deadlines stop at Singapore midnight,
one hour, or the next relevant incident/signal boundary. Healthy Markdown uses
the general edge cache policy; SQL-recovery Markdown remains `no-store`.
Arrival polling retains its separate published inputs and `no-store` contract.

A non-string `active` key causes Redis `WRONGTYPE` errors and cannot be repaired
by publication retries. After investigating the cause, recover as follows:

1. Stop and drain the canonical-pull and holiday writers that publish station
   profiles before changing the key.
2. Run `TYPE 'mrtdown:{<tier>:station-profiles:v1}:active'` against the intended
   Redis tier. Continue only if it reports a non-string type other than `none`.
   A string or absent key uses the normal publication repair path.
3. Run `DEL 'mrtdown:{<tier>:station-profiles:v1}:active'`, deleting only that
   key. Leave payloads and other namespaces intact.
4. Restart the writers and run an authenticated canonical pull to publish a new
   head. Confirm publication succeeds before considering the repair complete.

## Published sitemap inputs

Canonical pulls and authenticated `POST /internal/api/tasks/facts` publish
sitemap IDs and date bounds from a completed repeatable-read SQL snapshot.
They rebuild inputs rather than trusting a mutable SQL projection. Publication
uses the bounded atomic store under `mrtdown:{<tier>:sitemap:v1}`; active data
persists and partial promotion preserves the previous head. Unchanged pulls
verify fingerprint, generation and payload before skipping SQL.

Requests recompute Singapore dates, archive paths and empty archive month bounds.
Missing/invalid/unavailable inputs fall back lazily to the SQL sitemap snapshot,
including the legacy earliest-date lookup when needed. Check `sitemap_source`
in Server-Timing and compare sitemap paths with SQL after repair.

## Unchanged holiday checks

After one completed holiday workflow, a matching normalized nonempty data.gov.sg
source and valid range payload skip SQL and its writer lease. Source identity
includes names and hashes. Empty, truncated or unavailable upstream responses
fail before database access; missing/corrupt Redis state cannot authorize a skip.

Holiday writers share the canonical pull lease. Pending fact dates commit with
holiday changes and remain until facts, publication and purge succeed. Writers
invalidate the Redis receipt before mutation; Redis failure stops the write for
retry. The receipt is written last. A superseded workflow cannot certify a newer
writer; start a new workflow after `Holiday sync superseded`. Failed attempts
release their lease; crashes rely on lease expiry.

Persistent keys are under
`mrtdown:{<tier>:range-snapshot:v1}:public-holidays:{writer,completed}`. After any
out-of-band holiday SQL edit, older-code writer, Redis restore or writes without
Redis, clear only the tier's `public-holidays:completed` key and run the
holiday task to repair. The next unchanged run should contain only initialization
and `check-published-public-holidays`. Observe steps without querying SQL.

## Published arrival metadata

Completed pulls publish admission history, attested canonical topology,
projection headers, coverage days/scopes and display names together in a
read-only repeatable-read transaction. The publisher verifies topology and the
retained admission chain and rejects incomplete projections for current topology.

The bounded atomic store under `mrtdown:{<tier>:arrival-inputs:v1}` keeps active
data persistent. Bounds are 100 retained versions/projection headers, 10,000 day
rows, 100,000 scope rows, 4 MiB encoded and 24 MiB expanded JSON. A violation
fails publication and preserves the preceding head; inputs are never truncated.

Missing or invalid metadata forces SQL repair even when the range checkpoint
is current. All required inputs must publish before purge and checkpoint
completion. Check `arrival_inputs_published` and cold validated reads after repair.

## Published departure partitions

Compact station/projection partitions retain explicit dates, shared memberships,
platforms, unknown timing and overnight offsets. New or damaged partitions publish
in separate durable steps; unchanged completed projections reuse verified hashes.
The atomic manifest binds departures to the exact arrival metadata digest.
Purge and checkpoint completion follow activation.

Limits are 1,000 partitions, 20,000 distinct calls per partition, 8 MiB expanded
and 2 MiB encoded per partition, and 64 MiB total encoded partitions. Failures
preserve the previous manifest. Active parts persist; pending/retired parts expire
after 24 hours. Restart a pull if pending parts expire before activation. Metadata,
canonical attestation, projection identity and the writer lease are checked before
activation. Never resume an obsolete publication against newer canonical inputs.

Check `arrival_departures_published`, total bytes and latency after repair.
Unchanged polls should finish before SQL lease acquisition. The
[sleep plan](../plans/active/neon-sleep.md) records completed rollout evidence.

## Public community disruption signals

With Redis configured, home, station and line community-signal reads use public
cluster inputs, including initialized-empty results, without SQL. Other profile
reads still have independent SQL dependencies. The existing ongoing-report,
confidence and producer policy is shared with the SQL reader. Requests filter
scope before the 20-signal limit and apply the 90-minute expiry at their clock.

Moderation, public/programmatic submissions, duplicates, dispatch and fixture
cleanup invalidate before committing display changes, then refresh from SQL.
Invalidation failure rejects the write before commit; publication failure after
commit preserves acceptance and leaves SQL fallback available. Failed attempts
and programmatic replays repair only missing/dirty snapshots, preserving healthy
entries. The publication lock is taken after incident work, just before commit;
GitHub requests keep only their incident-specific dispatch lock. A shared SQL
lock and Redis WATCH/MULTI fence concurrent and delayed writers. Canonical publication remains
independent of community activity.

The single persistent `mrtdown:<tier>:community-signals:v1` key contains at most
10,000 eligible clusters and 4 MiB of public fields, with no reporter identities
or submission text. Bounds fail publication rather than truncate scoped results.
Missing, dirty, corrupt or unavailable state uses SQL with `no-store`; public
reads never refill it. Expiry alone needs no SQL or scheduled refresh.

Initialize after deploying all writers, or repair after eviction, Redis restore,
out-of-band SQL edits or writes made without Redis:

```sh
npm run cache:community-signals:repair
```

Run with the target environment's `DATABASE_URL`, `REDIS_URL` and `TIER`, then
purge its public data tag using the existing procedure. Verify cold/warm home
reads and initialized-empty results without SQL. This command does not deploy,
change schedules or purge the edge automatically.

## Recent arrival reports

Accepted SQL submissions invalidate and refresh Redis. Non-platform report hits,
initialized-empty results and clock expiry need no SQL. SQL-backed schedules
retain report fallback and a bounded missing/dirty-cache repair attempt;
published schedules omit unavailable optional reports. Platform queries omit them.

Repair runs after an accepted report or when a SQL-backed read finds missing or
dirty cache state. There is no operator seed task, and published schedule reads
do not repair reports. After Redis restore or eviction, reports may stay omitted
until one of those repair paths runs.

Repair loads at most 10,000 recent accepted rows; exceeding the bound keeps SQL
fallback. There is no timer or expiry refill. The cache contains no reporter
identities. Reports preserve the validated destination; mismatched/legacy rows
are omitted rather than relabelled from newer topology.

Invalidation failure rejects submission before insertion. Publication failure
after commit preserves the accepted report and leaves the cache unknown until
repair. Writers/repairs share a SQL lock; Redis WATCH/MULTI fences delayed
publishers. Readiness and scopes share one hash so eviction remains unknown.
Direct SQL edits and writers without Redis do not refresh the report cache.

## Published arrivals reader

The public v2 endpoint requires metadata and departure heads with matching
generation, fingerprint and metadata digest. It reads selected station/projection
partitions with bounded decoding and digest/identity checks. Shared SQL-path
policy and assembly preserve scope validation, Singapore dates and 24+ hour tails,
labels, limits and covered-empty responses at the request clock.

Missing/mismatched/corrupt required inputs select SQL recovery lazily. Only cached
scope rejections check SQL's completed generation: changed/updating generations
select SQL validation for newly promoted scopes; matching generations retain 400.
Valid published scopes never make this check. Requests do not publish or repair
departures. Healthy cold/warm reads, midnight and report expiry need no SQL.
Dirty/unavailable optional reports are omitted until an accepted report or a
SQL-backed repair restores them. Arrivals responses remain `no-store`.

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
