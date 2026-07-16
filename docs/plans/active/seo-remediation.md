# SEO Remediation Plan

## Context

An SEO audit of the local development instance on 2026-06-21 found that the site
already server-renders useful metadata for home and core entity pages, and has a
public XML sitemap, `robots.txt`, `llms.txt`, and Markdown alternatives for
agent-oriented readers.

The same audit found crawl-quality and metadata consistency gaps that should be
fixed before treating the public surface as search-ready:

- The XML sitemap included URLs that redirected, timed out, or returned `500`.
- Rendered HTML did not include canonical links or page-level `hreflang`
  alternates.
- Localized home URLs disagreed between routable URLs, sitemap alternates, and
  `og:url`.
- Some static and history pages lacked meta descriptions.
- The history year route emitted `og:url` with the literal path parameter
  `/history/$year`.
- Issue page descriptions still contained the placeholder period value `WIP`.

Observed local crawl results from `http://localhost:3000/sitemap.xml`:

| Result | Count |
| --- | ---: |
| `200` | 44 |
| `307` | 1 |
| `500` | 1 |
| timeout | 3 |

Problem URLs observed locally:

- `/history` redirected to `/history/2026/06`.
- `/history/2026/05` returned `500` because operational fact coverage was
  missing for the month.
- `/lines/ISL`, `/lines/TKL`, and `/lines/TWL` exceeded a 25-second request
  timeout.

Relevant code:

- `app/util/sitemap.functions.ts`
- `app/routes/{-$lang}/history/index.tsx`
- `app/routes/{-$lang}/history/$year/index.tsx`
- `app/routes/{-$lang}/history/$year/$month.tsx`
- `app/routes/{-$lang}/issues/$issueId/index.tsx`
- `app/routes/__root.tsx`
- `app/helpers/buildLocaleAwareLink.ts`

## Goals

- Ensure every URL emitted in the XML sitemap is crawlable and returns `200`
  without redirects.
- Add consistent canonical links and `hreflang` alternates to public HTML pages.
- Keep localized canonical URLs, Open Graph URLs, and sitemap URLs in agreement.
- Remove placeholder text from issue metadata.
- Add useful meta descriptions to static and history pages.
- Preserve existing Markdown routes and `llms.txt` behavior unless a phase
  explicitly changes discovery.
- Add tests or smoke checks that prevent sitemap and metadata regressions.

## Non-Goals

- This plan does not redesign the public UI.
- This plan does not change the data pull workflow except where sitemap safety
  requires checking available read-model coverage.
- This plan does not add Markdown routes to the XML sitemap. Markdown discovery
  remains owned by `llms.txt`.
- This plan does not optimize every slow page generally; it only addresses
  performance issues that block crawlable sitemap URLs.

## Phases

### Phase 1: Make Sitemap URLs Crawl-Clean

- Remove redirect-only URLs from the sitemap while they remain redirects.
  `/history` is the known case.
- Decide whether history months without operational fact coverage should be
  excluded from the sitemap or rendered as degraded-but-valid pages.
- Implement the chosen history-month behavior so `/history/2026/05` and similar
  pages do not appear as `500` sitemap entries.
- Investigate line profile SSR timeouts for `/lines/ISL`, `/lines/TKL`, and
  `/lines/TWL`.
- Fix the line route or exclude affected line URLs from sitemap output until the
  route can reliably return within the crawl smoke-check budget.
- Add sitemap tests for redirect-only paths, history month coverage handling,
  and line URL inclusion rules.

Exit criteria:

- A local crawl of every sitemap `<loc>` returns `200`.
- No sitemap `<loc>` redirects.
- No sitemap `<loc>` exceeds the selected smoke-check timeout.
- `npm run verify` passes.

### Phase 2: Centralize Canonical And Locale Metadata

- Add a shared SEO helper that builds canonical URLs, Open Graph URLs, and
  locale alternate links from the same route path.
- Include alternates for `en-SG`, `zh-Hans`, `ms`, and `ta`.
- Include `x-default` where the helper can define a stable default URL.
- Normalize localized home URLs so `/zh-Hans`, `/ms`, and `/ta` agree across
  routing, sitemap, canonical links, and `og:url`.
- Prefer route-specific titles and descriptions, but centralize repeated URL,
  locale, Open Graph, and canonical boilerplate.
- Add unit tests for URL normalization and alternate generation.

Exit criteria:

- Representative rendered pages include one canonical link.
- Representative rendered pages include expected `hreflang` alternates.
- Sitemap alternates and page-level alternates use the same URL policy.
- Localized home pages no longer disagree between current URL, `og:url`, and
  alternates.

### Phase 3: Fix Known Metadata Bugs

- Fix the history year route so `og:url` uses the actual year parameter instead
  of `/history/$year`.
- Add meta descriptions and `og:description` to:
  - `/about`
  - `/statistics`
  - `/system-map`
  - `/history/:year`
  - `/history/:year/:month`
- Replace issue metadata period placeholder text with a real interval or date
  range derived from issue data.
- Review title quality for entity pages and decide whether bare entity names
  should include a site or context suffix.
- Keep social image metadata using the existing `1200 x 630` `og_image.png`
  unless a later design task replaces it.

Exit criteria:

- `/history/2026` no longer emits `/history/$year` in rendered metadata.
- Issue descriptions do not contain `WIP`.
- Static and history pages render useful meta descriptions.
- Representative Open Graph metadata matches canonical URL policy.

### Phase 4: Add SEO Smoke Checks

- Add a local script, `npm run seo:check`, that fetches the local sitemap and
  validates each `<loc>`.
- Validate that representative HTML pages include:
  - `<title>`
  - meta description
  - canonical link
  - `hreflang` alternates
  - `og:url`
- Validate that sitemap URLs return `200` without redirects.
- Validate that known placeholder strings such as `WIP` do not appear in
  descriptions.
- Decide whether this smoke check should run in `npm run verify` or remain a
  manual/local check requiring a running app.

Exit criteria:

- The smoke check is documented and repeatable.
- The smoke check covers sitemap status, canonical metadata, locale alternates,
  and known placeholder regressions.
- `npm run verify` passes.

## Progress Log

- 2026-06-21: Local SEO audit completed and plan created. `npm run verify`
  passed after rerunning outside the sandbox because the first sandboxed run
  failed when `tsx` could not create its IPC pipe.
- 2026-06-21: Started Phase 1 and Phase 3 remediation. Sitemap generation now
  omits the redirect-only `/history` URL and skips historical month URLs when
  operational fact coverage is missing and the legacy fallback cannot render the
  route. Static/history pages now emit meta descriptions and `og:description`,
  the history year route uses the concrete year in `og:url`, and issue
  descriptions no longer emit the `WIP` period placeholder.
- 2026-06-21: Local sitemap crawl against the Vite dev server checked 47
  sitemap URLs with redirects disabled and a 25-second per-URL timeout. Every
  URL returned `200`, with no redirects or timeouts.
- 2026-06-21: Continued Phase 2 by adding a shared SEO helper for canonical
  URLs, Open Graph URLs, locale alternates, and head links. Home, static,
  history, entity, report, and community report pages now emit canonical links
  and full `hreflang` alternates from the same route path policy. XML sitemap
  alternates now use the same helper and include `en-SG` plus `x-default`.
- 2026-06-21: Started Phase 4 by adding `npm run seo:check`. The check expects
  a running app, fetches `/sitemap.xml`, verifies each sitemap `<loc>` returns
  `200` without redirects, and validates representative HTML pages for title,
  meta description, canonical link, `hreflang` alternates, `og:url`, and the
  known `WIP` description placeholder.
- 2026-07-16: Decoupled year, month, and day history reads from operational
  facts. History now selects issues from canonical period events, discards stale
  superseded period revisions, and builds only the matching issue/entity
  dataset. Sitemap history URLs no longer depend on rolling fact coverage.

## Decision Log

- 2026-06-21: Keep Markdown routes out of the XML sitemap. They remain
  discoverable through `llms.txt`, matching the existing `sitemap.functions`
  tests and avoiding duplicate search crawl surfaces.
- 2026-06-21: Treat crawl-clean sitemap output as the first phase because search
  engines should not be directed to redirects, errors, or very slow pages.
- 2026-06-21: Exclude historical month URLs from the XML sitemap when the month
  is before today, lacks full operational fact coverage, and is not before the
  operational fact coverage start date. This mirrors the history route's
  degraded-render fallback and avoids advertising known `500` month pages.
- 2026-07-16: Supersede the fact-coverage sitemap rule above. Incident history
  is canonical issue data, while operational facts are a rolling statistics
  read model; history availability and sitemap inclusion must not depend on the
  operational-fact retention window.

## Validation

Before handing back implementation work for this plan:

- Run `npm run verify`.
- Run `npm run seo:check` against a running local or deployed app. Pass the base
  URL as the first argument or set `VITE_ROOT_URL`; otherwise the script checks
  `http://localhost:3000`. Set `SEO_CHECK_TIMEOUT_MS` to override the default
  25-second per-request timeout.
- Manually or programmatically crawl `http://localhost:3000/sitemap.xml` and
  confirm every `<loc>` returns `200` without redirects.
- Sample at least these rendered pages for title, description, canonical,
  `hreflang`, and `og:url`:
  - `/`
  - `/zh-Hans`
  - `/about`
  - `/statistics`
  - `/system-map`
  - `/history/2026`
  - `/history/2026/06`
  - one line page
  - one station page
  - one operator page
  - one issue page
