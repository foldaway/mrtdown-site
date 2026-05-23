# Site Slowness Investigation (2026-05-21)

## Scope

Investigated likely causes of runtime slowness by reviewing route loaders and server data assembly paths, then confirmed the production behavior with live checks from Singapore on 2026-05-21.

## Key Findings

### 1) Root layout loader fetches large shared data on every page load/navigation

`/{-$lang}` route loader always calls `getRootFn`, which in turn always calls `getRootData`. This happens for the root layout that wraps all child pages.

`getRootData` returns:
- all line IDs,
- full `included` entity payload,
- metadata,
- all operator IDs,
- full operators payload.

Even though it excludes issues (`withIssues(..., [])`), the included payload still carries full lines/stations/towns/landmarks dictionaries and is likely large.

Potential impact:
- higher TTFB for cold/expired cache requests,
- larger serialized SSR/dehydration payload to send to clients,
- extra parse/hydration cost on the client.

### 2) Base dataset construction is expensive and cache TTL is short (60s)

`getBaseDataset` builds the complete dataset via `buildBaseDataset/buildDataset` when cache is empty/expired. Cache TTL is only 60 seconds and process-local.

Potential impact:
- frequent dataset rebuilds under moderate traffic,
- repeated expensive in-memory processing for many pages,
- worse behavior on multi-instance/serverless deployments where caches are not shared.

### 3) Overview computation repeatedly scans issues per line (O(lines × issues))

In `getOverviewData`, line summaries are built by iterating all lines and filtering all issues per line (`issues.filter(...)`).

Potential impact:
- CPU-heavy request path, especially when issue history grows,
- increased latency for the home page and endpoints using overview data.

### 4) The repository itself flags large generated artifacts

`AGENTS.md` explicitly calls out large generated station map snapshots under `app/components/StationMap/components/Map*.tsx`.

Potential impact:
- route-specific bundle bloat (especially system map route),
- slower first load and parse/execute time when those modules are pulled.

## Production reachability check from this environment

Initial attempts to benchmark production endpoints from the earlier execution environment were blocked:

- `curl -L -w ... https://mrtdown.org/` -> HTTP code `000` / curl exit `56`
- `curl -Iv https://mrtdown.org/` -> proxy tunnel `403 Forbidden`

Running locally later on 2026-05-21, direct production checks succeeded. The bare domain redirects to `https://www.mrtdown.org/`.

## Live production timing check

Measured with `curl -L --compressed` from Singapore.

| Route | TTFB samples | Downloaded size |
| --- | ---: | ---: |
| `/` | 2.39s, 2.89s, 4.91s | ~134 KB compressed |
| `/statistics` | 8.26s, 10.31s, 11.86s; later 14.13s | ~135 KB compressed |
| `/lines/BPLRT` | 2.14s, 3.00s, 3.83s; later 5.50s | ~75-129 KB compressed |
| `/history` | 0.56s, 1.40s, 1.87s | ~75 KB compressed |
| `/system-map` | 0.56s, 0.65s, 2.55s | ~98-153 KB compressed |
| `/about` | usually 0.13s-0.19s; one capture at 1.54s | ~64 KB compressed |
| JS/CSS assets | 0.05s-0.20s | Cloudflare HIT |

Key observations:

- HTML responses have no `cf-cache-status` header and no useful `cache-control` header in the sampled responses. They appear to be rendered at origin on every request.
- Static JS/CSS assets are fast and served from Cloudflare cache, so CDN/static asset delivery is not the main bottleneck.
- TTFB accounts for almost the whole request time, which points to server render/data work before first byte rather than slow response transfer.
- The root page HTML decodes to ~833 KB, including ~590 KB of inline TanStack router hydration data.
- `/statistics` decodes to ~756 KB, including ~573 KB of inline hydration data.
- `/lines/BPLRT` decodes to ~617 KB, including ~570 KB of inline hydration data.

Conclusion: the live check confirms the code-level hypothesis. The production app is serializing a large shared data payload into SSR pages, and route loaders, especially `/statistics`, are doing expensive work per request.

## Recommended next actions

1. **Split root loader payload by actual UI need**
   - Keep root data minimal (only nav and metadata needed globally).
   - Move heavy data fetching to route-level loaders where needed.
   - Consider returning denormalized lightweight nav models instead of full entity dictionaries.

2. **Increase or redesign base dataset caching**
   - Raise TTL above 60s for read-mostly data, or
   - introduce stale-while-revalidate strategy, or
   - precompute and persist a read model snapshot.

3. **Pre-index issues by line once per request/cached dataset**
   - Build `issuesByLineId` once and reuse across summary builders.
   - Avoid per-line filtering over full issue list.

4. **Confirm client bundle hotspots with build analysis**
   - Run bundle analyzer to quantify map chunk sizes.
   - Ensure map-heavy code is route-split and lazy-loaded.

5. **Collect real-user and server metrics in production**
   - Add server timing around `getBaseDataset`, `getRootData`, and `getOverviewData`.
   - Track payload size of root loader response.
   - Capture Web Vitals (LCP/INP/CLS) segmented by route.

6. **Add CDN/origin caching for public SSR HTML**
   - Add short `s-maxage` plus `stale-while-revalidate` for cacheable public pages.
   - Keep static assets on long-lived hashed URLs.
   - Verify that pages with request-specific behavior are either excluded or vary correctly.

7. **Precompute expensive route data**
   - Precompute `/statistics` data or serve it from a static artifact/cache instead of recomputing on request.
   - Split line-page data so each line route serializes only the selected line plus required related entities.
