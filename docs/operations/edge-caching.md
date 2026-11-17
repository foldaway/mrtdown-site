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
Postgres. Keep `REDIS_NAVIGATION_CACHE` on its own setting so the two
readers can be evaluated independently. With only Issue Profile caching
enabled, the pull still publishes the shared generation and Navigation value.

An Issue Profile with ended intervals can fill Redis only when a
repeatable-read Postgres snapshot sees the published generation marked
complete. The pull marks it updating with the first live canonical write.
Redis checks the active generation atomically with each profile read or write.
Entries are limited to 128 KiB and expire at Singapore midnight. Cache hits
can populate Cloudflare for up to 15 minutes, capped at the same midnight.
SQL responses bypass shared caching while the reader is enabled.

On staging origin requests, check `X-MRTDown-Issue-Profile-Source`. A cold
completed issue returns `sql` with `no-store`, then returns `redis` on the
next origin request. HTML and Markdown share a Redis entry. For rollback,
unset `REDIS_ISSUE_PROFILE_CACHE` and purge the tier's data tag.

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
