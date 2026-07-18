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

## Required Cloudflare Rules

Create a Cache Rule for each proxied application hostname with these logical
conditions:

- Method is `GET` or `HEAD`.
- Path is `/`, `/about`, `/statistics`, `/system-map`, `/history` and its
  descendants, or a public `/issues/*`, `/lines/*`, `/operators/*`, or
  `/stations/*` profile, including locale-prefixed variants; or it is a
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
3. Purge `mrtdown-<tier>-data` through the Cloudflare API.
4. Release the pull-workflow lease.

The application does not retain public read models in a process-local cache.
After a purge, the next Cloudflare MISS therefore reads current Postgres data
and cannot refill the edge from stale Fly process memory.

Public-holiday changes use the same publication sequence. Successful crowd
report submissions also purge the tag because public signals appear on cached
home, line, and station pages. A crowd-report purge failure is logged without
turning an already-committed submission into a retryable client failure; the
bounded edge TTL remains the fallback.

Configure these server-only Fly secrets before enabling the Cache Rule:

```text
CLOUDFLARE_ZONE_ID
CLOUDFLARE_CACHE_PURGE_TOKEN
```

The API token should be scoped to the application zone with only the
`Cache Purge` permission. Preview, staging, and production publication steps
fail if either value is missing, so a deployment cannot silently claim that it
published fresh cached data. Local development logs and skips invalidation.

## Verification

After deployment:

1. Request a representative HTML, Markdown, and sitemap URL twice.
2. Confirm the first response is `MISS` and the second is `HIT` or `UPDATING`.
3. Confirm cached responses expose `Age` and the expected
   `X-MRTDown-Cache` value.
4. Run a pull containing a known issue update.
5. Confirm the next request is `MISS` and contains the updated data.

Cloudflare removes `Cache-Tag` before sending the response to visitors. Use
Cloudflare Trace or inspect the direct origin response when validating tags.
