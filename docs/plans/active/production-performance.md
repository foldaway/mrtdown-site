# Production Performance Plan

## Context

Production checks on 2026-05-22 show that heavier pages are slow mainly because
the Worker spends several seconds preparing SSR HTML before it sends the first
byte. Static assets are served quickly from Cloudflare, so asset delivery is not
the primary bottleneck.

This plan follows the investigation in
`docs/investigations/2026-05-21-site-slowness.md`.

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
- Add post-launch Markdown surface traffic checks for:
  - `/llms.txt`
  - `/index.md`
  - representative entity `index.md` routes
  - `.md` alias attempts
  - `Accept: text/markdown` requests
- Capture whether each response was Worker-rendered or edge-cached.

Exit criteria:

- A production response for `/statistics` shows timing breakdowns.
- We know whether the 7s-11s latency is dominated by DB, CPU, SSR rendering, or
  serialization.
- Markdown route traffic can inform whether XML sitemap inclusion or `.md`
  aliases are worth adding later.

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

- Keep the multi-viewport expansion flow, but make the SSR and client expansion
  payloads cheap enough through Phase 2 included-entity pruning.
- Preserve the 30-day SSR baseline for small screens.
- Use measured viewport only for client-side expansion requests, not route
  search params or blocking SSR dependencies.

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

## Progress Notes

- 2026-05-25: Implemented Phase 1 Worker-side public HTML caching for
  successful public `GET` responses on the planned cacheable route set, plus
  origin cache headers for matching `GET`/`HEAD` responses. Cacheable pages now
  emit `Cache-Control: public, max-age=0, s-maxage=60,
  stale-while-revalidate=300` and `X-MRTDown-Cache: public-html`; cache hits
  return before SSR with `X-MRTDown-Render: public-html-cache`. API/internal
  routes, non-candidate pages, non-HTML responses, non-200 responses,
  `Set-Cookie`, private/no-store opt-outs, and client no-cache requests are
  excluded. Added focused route-matching and cache-key tests in
  `app/util/publicHtmlCache.test.ts`.
- 2026-05-27: Started Phase 2 payload reduction for `/statistics`. The
  statistics loader now returns an explicit included-entity subset: all lines
  needed by the line chart, the top station-chart stations, the longest
  disruption issues, and the line/station dependencies those issue cards need.
  It no longer serializes the full operators, towns, landmarks, or station
  dictionaries for the statistics route. Added focused selector coverage in
  `app/util/db.queries.test.ts`.
- 2026-05-27: Advanced Phase 2 for `/` and started Phase 3. The home loader now
  returns an explicit included-entity subset instead of the full base included
  graph: rendered line summaries, selected advisory/date-card issues, and the
  line/station dependencies those issue cards need. The route now SSR-loads the
  mobile-sized 30-day window, then fetches the existing viewport-sized 60/90-day
  windows client-side for larger screens without navigating to a `viewport`
  search parameter.
- 2026-05-27: Extended Phase 2 payload reduction beyond home/statistics. Line,
  station, operator, issue, and history loaders now use the explicit
  included-entity selector instead of spreading the full base included graph
  into each response. The selector can now opt into route-local operators,
  station towns, and station landmarks for pages that actually render them.
- 2026-05-27: Extended the Phase 3 viewport-reload cleanup to operator profile
  pages. Operator routes now SSR-load a 30-day baseline and fetch the wider
  60/90-day viewport windows client-side without navigating to a `viewport`
  search parameter, matching the home page pattern.
- 2026-05-27: Started Phase 4 precomputed statistics. Added a rebuildable
  `statistics_snapshots` read-model table, refresh it after pull workflow
  operational facts and manual facts rebuilds, and make the statistics route use
  the snapshot when available. The existing request-time statistics builder
  remains as a fallback for development and un-migrated environments.
- 2026-05-30: Continued Phase 4 by storing the statistics route's pruned
  included-entity payload inside new statistics snapshot rows. The request path
  now returns precomputed snapshot data and included entities without rebuilding
  a dataset when the v1 snapshot shape is available, while legacy
  statistics-only snapshot rows still fall back to the previous included-entity
  assembly path.
- 2026-05-31: Started Phase 5 production Web Vitals telemetry. The root route
  now captures browser FCP, LCP, CLS, and approximate INP metrics through the
  existing PostHog provider in production, tagged with normalized route paths so
  entity IDs do not create high-cardinality analytics dimensions.
- 2026-06-10: Continued Phase 5 statistics hydration cleanup. The statistics
  grid now lazy-loads chart-heavy cards behind stable skeleton placeholders and
  an `IntersectionObserver` viewport gate, keeping Recharts and chart card code
  out of the initial statistics route render until the cards are near view. A
  production build emits separate client chunks for `CountTrendCards`,
  `DurationTrendCards`, `LinesIssueCountCard`, `StationsIssueCountCard`, and
  `DisruptionsHeatmap`.
- 2026-06-11: Continued Phase 5 line profile hydration cleanup. The line route
  now lazy-loads the focused system map and line chart cards behind stable
  skeleton placeholders and an `IntersectionObserver` viewport gate. A
  production build keeps the line route entry chunk from preloading the
  generated `StationMap` asset and shared Recharts charting chunk up front; they
  remain nested lazy dependencies of the line component chunk.
- 2026-06-11: Continued Phase 5 operator profile hydration cleanup. The
  operator route now lazy-loads the shared line chart cards behind stable
  skeleton placeholders and an `IntersectionObserver` viewport gate. A
  production build emits separate client chunks for `CountTrendCards`,
  `UptimeRatioTrendCards`, and the shared Recharts charting chunk instead of
  importing the chart implementation directly in the operator route entry.
- 2026-06-11: Continued Phase 5 generated map bundle cleanup. `StationMap` now
  keeps the current April 2025 snapshot in the base map chunk and lazy-loads
  historical and future generated snapshots only when their timeline tabs are
  opened. A production build emits separate client chunks for the inactive
  `MapJan2012`, `MapNov2017`, `MapDec2019`, `MapNov2024`, `MapDec2027`,
  `MapDec2029`, `MapDec2030`, and `MapDec2032` snapshots.
- 2026-06-11: Continued Phase 5 statistics hydration cleanup by lazy-loading
  the longest-disruptions card behind the existing statistics viewport gate and
  skeleton. The statistics route preload set no longer includes `IssueCard`,
  Radix Collapsible, or chevron icon chunks up front; those dependencies now
  sit behind the separate `LongestDisruptionsCard` chunk. Tightened the
  TanStack route-file ignore pattern so support `helpers`, `components`,
  `hooks`, and test files are not scanned as route files during builds.
- 2026-06-12: Continued Phase 5 hydration cleanup by extracting the repeated
  viewport-gated `Suspense` wrapper used by statistics, line, and operator
  routes into `DeferredViewportWidget`, and by sharing the profile chart/map
  skeletons. A production build keeps statistics chart cards, line trend cards,
  `LineSystemMapCard`, and generated `StationMap` assets as dynamic imports
  rather than route preloads; route preloads now include only the small shared
  deferred wrapper.
- 2026-06-13: Continued Phase 5 profile route hydration cleanup by lazy-loading
  the optional `CommunitySignalsSection` behind `DeferredViewportWidget` on
  home, line, and station routes. A production build now emits a separate
  `CommunitySignalsSection` client/server chunk, and the home, line, and
  station route component entries list it only as a dynamic import instead of
  an eager route dependency.
- 2026-06-13: Continued Phase 5 profile route hydration cleanup by
  lazy-loading recent-issues sections behind `DeferredViewportWidget` on line,
  operator, and station profile routes. A production build now emits separate
  recent-issues chunks, keeping `IssueCard` out of the initial profile route
  render and keeping the shared line/operator recent-issues Radix Collapsible
  dependency behind the viewport gate.
- 2026-06-13: Continued Phase 5 route preload cleanup by removing the unused
  runtime `ViewportSchema` from `useViewport`. The home and operator route
  entries still use the viewport hook, but the production build no longer pulls
  the `zod` chunk through that hook.
- 2026-06-13: Continued Phase 5 home hydration cleanup by splitting the
  collapsed current-advisory issue details into a lazy `Details` chunk and
  replacing the eager Radix Collapsible dependency with local button state. A
  production build emits separate client assets for `Details` and `IssueCard`,
  keeping advisory detail cards out of the initial home route bundle until the
  user opens the section.
- 2026-06-13: Continued Phase 0 repeatable production checks by extending
  `npm run perf:routes` beyond public HTML routes. The script now samples
  `/llms.txt`, `/index.md`, representative line/station/operator `index.md`
  routes, `.md` alias attempts, and a regular HTML route with
  `Accept: text/markdown`; results include sample number, TTFB, total time,
  response bytes, content type, Cloudflare cache status, app cache marker,
  render source, cache-control, and server-timing headers. Use
  `PROBES=html`, `PROBES=markdown`, or `PROBES=all` to scope a run.
- 2026-06-13: Ran `SAMPLES=1 PROBES=markdown npm run perf:routes --`
  against production after the script update. `/llms.txt`, `/index.md`, and
  representative line/station/operator `index.md` routes returned 200
  `text/markdown` responses with `X-MRTDown-Cache: public-markdown`.
  Unsupported `.md` alias attempts and `/lines/BPLRT` with
  `Accept: text/markdown` currently return 500 JSON responses in production,
  so a follow-up should decide whether those should normalize to 404/406 before
  adding alias support.
- 2026-06-13: Normalized unsupported Markdown request surfaces before they
  reach the TanStack router. Non-canonical `.md` alias attempts now return 404
  plain text, while explicit `Accept: text/markdown` requests for non-Markdown
  routes return 406 plain text. Canonical Markdown routes still pass through
  their route handlers and keep public Markdown cache headers.

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

SAMPLES=2 PROBES=all npm run perf:routes -- https://www.mrtdown.org
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
