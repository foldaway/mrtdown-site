# Production Performance Plan

## Context

Production checks on 2026-05-22 show that heavier pages are slow mainly because
the Worker spends several seconds preparing SSR HTML before it sends the first
byte. Static assets are served quickly from Cloudflare, so asset delivery is not
the primary bottleneck.

Measured from Singapore with `curl --compressed -L`:

| Route | TTFB samples | Transfer size |
| --- | ---: | ---: |
| `/` | 2.44s, 1.08s, 0.92s | ~77 KB compressed |
| `/statistics` | 9.73s, 7.15s, 10.99s | ~77 KB compressed |
| `/about` | 0.06s-0.15s | ~9 KB compressed |

The sampled SSR responses did not expose useful `cache-control`,
`cf-cache-status`, or `server-timing` headers. That makes it likely that public
HTML is being rendered dynamically for each request, and also means we cannot
yet separate database time, CPU time, and serialization time from production
headers alone.

## Goals

- Bring `/statistics` TTFB below 1.5s for warm production requests.
- Bring home page TTFB below 750ms for warm production requests.
- Keep first-load HTML under 250 KB uncompressed for home and statistics.
- Avoid client-side reloads immediately after home page hydration.
- Add measurements that let future regressions identify whether latency is in
  database queries, in-memory computation, SSR rendering, or response payload
  size.

## Non-Goals

- This plan does not redesign the visual UI.
- This plan does not replace TanStack Start.
- This plan does not change the canonical pull workflow unless a later phase
  chooses to persist precomputed public page data.

## Root Causes

### 1. Statistics is computed on the request path

`getStatisticsData` loads the base dataset, scans all issues for line and station
totals, sorts longest disruptions, checks operational fact coverage, and builds
all chart payloads before the response can be rendered.

Relevant code:

- `app/routes/{-$lang}/statistics/index.tsx`
- `app/util/statistics.functions.ts`
- `app/util/db.queries.ts#getStatisticsData`

### 2. Route responses serialize more included data than they need

`withIssues` spreads the whole base included entity set into route payloads. Even
when a route only needs selected issues, the response still carries full line,
station, operator, town, and landmark dictionaries.

This inflates:

- SSR HTML size
- TanStack router hydration payload
- client parse and hydration work

Relevant code:

- `app/util/db.queries.ts#withIssues`
- `app/contexts/IncludedEntities.ts`

### 3. Home page performs viewport-dependent data loading

The home route defaults to `viewport=xs`, then the client measures the viewport
and navigates to a new search parameter if the real viewport differs. Desktop
users can therefore pay for one SSR load and then a second loader request for a
larger date window.

Relevant code:

- `app/routes/{-$lang}/index.tsx`
- `app/hooks/useViewport.ts`
- `app/helpers/getDateCountForViewport.ts`

### 4. Base dataset cache is local to the Worker instance

`getBaseDataset` caches for five minutes in memory. That helps only for warm
requests handled by the same isolate or process. Cold starts, different isolates,
and cache expiry still rebuild the complete read model from many tables.

Relevant code:

- `app/util/db.queries.ts#getBaseDataset`
- `app/util/db.queries.ts#buildDataset`

### 5. Public SSR HTML does not appear to be edge cached

The sampled HTML responses did not include a visible `cf-cache-status` header or
useful public cache headers. Even cacheable public pages like `/statistics` are
therefore likely paying origin SSR cost per request.

## Plan

### Phase 0: Instrument First

Add request-path timing and payload visibility before changing behavior.

Tasks:

- Add `Server-Timing` spans for:
  - root loader
  - `getBaseDataset`
  - `getOverviewData`
  - `getStatisticsData`
  - fact table queries
  - chart payload building
- Log route-level response payload byte estimates in development or structured
  production logs.
- Add production route timing checks to a repeatable script, for example:
  - `/`
  - `/?viewport=md`
  - `/?viewport=lg`
  - `/statistics`
  - `/about`
- Capture whether each response was Worker-rendered or edge-cached.

Exit criteria:

- A production response for `/statistics` shows timing breakdowns.
- We know whether the 7s-11s latency is dominated by DB, CPU, SSR rendering, or
  serialization.

### Phase 1: Cache Public HTML Safely

Add short edge caching for cacheable public pages while preserving correctness.

Tasks:

- Set public cache headers for non-personalized SSR routes:
  - `s-maxage=60`
  - `stale-while-revalidate=300`
- Exclude internal task routes and any future personalized routes.
- Include route parameters and locale in the cache key.
- Verify Cloudflare emits cache status on repeated requests.

Candidate routes:

- `/`
- `/statistics`
- `/history`
- `/history/*`
- `/lines/*`
- `/operators/*`
- `/stations/*`
- `/system-map`
- `/about`

Exit criteria:

- Repeated requests for `/statistics` return from edge cache or equivalent
  platform cache.
- Warm repeated `/statistics` TTFB is below 1.5s.

### Phase 2: Shrink Serialized Included Entities

Make route payloads explicit instead of sending the whole base included graph.

Tasks:

- Replace broad `withIssues(baseIncluded, ...)` usage with route-specific
  included builders.
- For `/statistics`, include only:
  - lines needed for the line count chart
  - stations needed for the top station chart
  - issues needed for the longest disruptions card
  - entities those issue cards actually render
- For `/`, include only:
  - line summaries
  - issues referenced by visible advisory cards and line date cards
  - lines rendered by the page
- Consider splitting `IncludedEntitiesContext` into smaller contexts or passing
  route-local dictionaries directly.

Exit criteria:

- Home and statistics SSR HTML are each below 250 KB uncompressed.
- No visible regressions in line labels, station labels, issue cards, or locale
  rendering.

### Phase 3: Remove Home Viewport Reload

Avoid a post-hydration route navigation just to resize the date grid.

Options:

- Always return a fixed data window and hide overflow with CSS.
- Return the largest needed home window, but render fewer columns by viewport.
- Render the initial 30-day window on SSR, then fetch expanded history
  client-side without blocking first content.

Preferred approach:

- Return a single 60-day window for the home page.
- Use CSS container behavior to show the useful subset on small screens.
- Remove `viewport` from home route loader dependencies unless profiling shows
  the 60-day payload is too large after Phase 2.

Exit criteria:

- Loading `/` on desktop does not immediately navigate to `?viewport=*`.
- Home page has one loader pass on first visit.
- Home TTFB and hydration payload remain within the goals above.

### Phase 4: Precompute Statistics

Move expensive statistics assembly out of the request path.

Tasks:

- Extend the facts workflow or pull workflow to build a statistics read model.
- Persist precomputed chart payloads keyed by date or manifest version.
- Keep the request-time statistics loader limited to fetching the latest
  precomputed payload plus the small included entity subset.
- Keep the existing request-time builder as a development fallback only.

Exit criteria:

- `getStatisticsData` no longer scans all issues on normal production requests.
- `/statistics` remains fast even after Worker cold starts.
- Statistics updates after data pulls remain correct.

### Phase 5: Bundle and Hydration Cleanup

Address secondary client-side costs after the server path is under control.

Tasks:

- Inspect build output for why unrelated route chunks are module-preloaded on
  first load.
- Confirm `system-map` and generated map snapshots are route split and not
  pulled into home or statistics.
- Consider lazy-loading chart components below the fold on `/statistics`.
- Track Web Vitals by route, especially LCP and INP.

Exit criteria:

- Initial home route does not preload statistics or system-map chunks unless
  required by the router runtime.
- Chart-heavy statistics code is loaded only when needed.
- Route-level Web Vitals are visible in production telemetry.

## Suggested Implementation Order

1. Add `Server-Timing` and route timing logs.
2. Add short public HTML edge caching.
3. Shrink `/statistics` included payload.
4. Shrink `/` included payload.
5. Remove home viewport-dependent loader navigation.
6. Persist precomputed statistics payloads.
7. Clean up preloads and chart hydration.

This order gives quick production relief through caching, then reduces the
underlying compute and payload costs so uncached requests are also fast.

## Validation

For each phase:

- Run `npm run verify`.
- Capture route timings with repeated `curl --compressed -L` samples.
- Compare uncompressed HTML bytes for `/` and `/statistics`.
- Check production headers for cache and timing behavior.
- Manually verify home and statistics pages in a browser at mobile and desktop
  widths.

Useful commands:

```sh
curl --compressed -L -s -o /dev/null \
  -w 'code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total} bytes=%{size_download}\n' \
  https://www.mrtdown.org/statistics

curl --compressed -L -s -D /tmp/mrtdown-statistics.headers \
  -o /tmp/mrtdown-statistics.html \
  https://www.mrtdown.org/statistics

wc -c /tmp/mrtdown-statistics.html /tmp/mrtdown-statistics.headers
```

## Open Questions

- Does Cloudflare Workers currently support the desired cache API or should this
  be implemented through response headers and Cloudflare cache rules?
- Are statistics allowed to be stale by 1-5 minutes, or should they update
  immediately after each successful data pull?
- Which production telemetry target should own route timing data: Sentry,
  PostHog, Cloudflare logs, or structured application logs?
- Should precomputed statistics live in Postgres, KV/R2, or a generated artifact
  deployed with the Worker?
