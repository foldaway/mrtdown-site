# Verify deployed sitemap and metadata

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Confirm the target deployment advertises only crawlable 200 sitemap URLs and
consistent canonical, locale and Open Graph metadata. Implementation exists;
close the plan only with a recorded deployment crawl.

## Progress

- [x] (2026-06-21) Local rerun verified 47 sitemap URLs; shared metadata and
  smoke checks implemented.
- [x] (2026-07-16) Remove operational-fact retention as a history/sitemap gate.
- [ ] Select the target SHA/environment and record a current full crawl.

## Surprises & Discoveries

The original crawl found redirect-only history, missing-fact errors and line
profile timeouts. July canonical history reads superseded the initial workaround
of hiding months with missing rolling facts.

## Decision Log

- 2026-06-21 — Keep Markdown discovery in `llms.txt`, outside XML sitemap.
- 2026-07-16 — History availability follows canonical periods, independently
  of rolling statistics fact coverage.
- 2026-11-26, documentation review — Move delivered phases to the
  [foundation record](../completed/seo-foundations.md); keep deployment acceptance.

## Outcomes & Retrospective

The [foundation record](../completed/seo-foundations.md) retains local evidence
and superseded decisions. No target deployment was crawled during this review.

## Context and Orientation

The [SEO helper](../../../app/helpers/seo.ts) gives canonical, Open Graph and
locale alternates one URL policy. [Sitemap generation](../../../app/util/sitemap.functions.ts)
excludes redirect-only entry points. The smoke script reads all advertised URLs
and samples HTML metadata; it needs a running app with representative issue data.

## Plan of Work

Choose a deployment with the intended source revision and complete sitemap
projection. Run the full smoke check, inspect failures by status/URL and fix only
observed gaps. Keep timeouts distinct from metadata errors. Sample localized home,
static/history and line/station/operator/issue pages. Record whether protection
or unavailable data prevents the check rather than marking an incomplete crawl
accepted.

## Concrete Steps

From the repository root after installing dependencies:

```sh
npm run verify
npm run seo:check -- http://localhost:3000
```

Start the local app with disposable data using the README first, or replace the
URL with the selected deployment. Expect `SEO check passed` with sitemap and
representative counts. Requests are GETs; the full sitemap crawl can be lengthy.
`SEO_CHECK_TIMEOUT_MS` overrides the 25-second per-request limit. This remains a
manual check requiring a running app, outside the normal verification command.

## Validation and Acceptance

Every sitemap `<loc>` returns 200 without redirects or timeout. Representative
HTML has one nonempty description, title, canonical URL and matching `og:url`,
with en-SG, zh-Hans, ms, ta and x-default alternates. No `WIP` placeholder or
literal history parameter appears. Primary-locale redirects agree with policy;
Markdown routes and `llms.txt` retain their existing behavior.

## Idempotence and Recovery

Crawls can be repeated without writes. Keep failed URLs and timing context
before rerunning; do not hide valid canonical history to mask slow reads.
For a later metadata regression, revert the focused change and rerun against
the same dataset and deployment configuration.

## Artifacts and Notes

Still required: exact deployment SHA, UTC crawl time, sitemap/representative
counts, failures or passing output and any blocked coverage. The
[June/July record](../completed/seo-foundations.md) is obtained local evidence,
not a current production receipt.

## Interfaces and Dependencies

The [smoke script](../../../app/scripts/checkSeo.ts) owns its checks and sample
paths. The [sitemap reader](../../../app/util/dbQueries/sitemap.ts) requires a
completed projection. Shared metadata and canonical history tests protect source
policy; a live crawl establishes routability on the target environment.
