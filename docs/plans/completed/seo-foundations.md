# SEO metadata and sitemap foundations

The shared metadata helper, sitemap policy and SEO smoke script are present in
source as of November 26, 2026. This closes implementation; the
[active deployment check](../active/seo-remediation.md) retains crawl acceptance.

## Decisions and dated verification

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

The June 21 local rerun checked 47 sitemap URLs, all 200 without redirects or
25-second timeouts. Initial results were 44 successful URLs, one redirect, one
500 and three timeouts. This did not verify a deployed environment.

[Original record](https://github.com/foldaway/mrtdown-site/blob/fdf2a7b8effd7916f85c7e990b8b50ed7540fc96/docs/plans/active/seo-remediation.md) preserves problem URLs, exact
progress and the superseded fact-coverage rule. Current owners are
[metadata](../../../app/helpers/seo.ts), [sitemap](../../../app/util/sitemap.functions.ts),
[canonical history](../../../app/util/dbQueries/history.ts), and
[smoke checks](../../../app/scripts/checkSeo.ts). Markdown discovery stays in
`llms.txt`; it is excluded from the XML sitemap.
