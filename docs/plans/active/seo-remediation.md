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
It checks canonical/`og:url` equality and alternate language names, but not their
expected URL values. It follows advertised sitemap origins for crawl/dynamic
samples, so an origin guard and recorded metadata review are also required.

## Plan of Work

Choose a deployment with the intended source revision and complete sitemap
projection. Reject a sitemap advertising another origin before running the
smoke check, so every crawl/dynamic sample exercises the selected deployment.
Run the full smoke check, inspect failures by status/URL and fix only
observed gaps. Keep timeouts distinct from metadata errors. Sample localized home,
static/history and line/station/operator/issue pages, recording and reviewing the
canonical, `og:url` and alternate `href` values for each. Record whether protection
or unavailable data prevents the check rather than marking an incomplete crawl
accepted.

## Concrete Steps

From the repository root, install dependencies and configure a disposable local
database as in the README/quality guide, then migrate and seed it. The fixture
seed builds facts but does not build sitemap/statistics snapshots. Start the
local app in a separate terminal with SQL-only serving for this fixture check:

```sh
REDIS_URL= VITE_ROOT_URL=http://localhost:3000 npm run dev
```

In the check terminal, rebuild snapshots through the local development endpoint
before fetching the sitemap. This writes only the configured disposable database;
the dev server permits the request without a bearer credential:

```sh
npm run verify
curl --fail --silent --show-error -H 'Content-Type: application/json' -d '{"days":30}' http://localhost:3000/internal/api/tasks/facts
```

Require HTTP 200 with `success: true` and snapshot rebuild results. For an existing
deployment, use its completed canonical pull/publication instead of this local
fixture preparation; do not send the unauthenticated development request there.

Fetch and guard the sitemap before the smoke check (replace both base URLs
consistently for a deployed target):

```sh
curl --fail --silent --show-error http://localhost:3000/sitemap.xml -o /tmp/mrtdown-seo-sitemap.xml
SEO_CHECK_BASE_URL=http://localhost:3000 node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { decode } from 'html-entities';
const base = new URL(process.env.SEO_CHECK_BASE_URL);
const xml = readFileSync('/tmp/mrtdown-seo-sitemap.xml', 'utf8');
const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)];
if (!locs.length) throw new Error('Sitemap has no loc entries');
for (const [, loc] of locs) {
  const url = new URL(decode(loc.trim()));
  if (url.origin !== base.origin) throw new Error(`Wrong sitemap origin: ${url}`);
}
console.log(`Origin guard passed: ${locs.length} URLs on ${base.origin}`);
JS
```

Proceed only after the guard passes; otherwise correct the target's
`VITE_ROOT_URL` and rebuild/republish its sitemap before retrying. Then run:

```sh
npm run seo:check -- http://localhost:3000
```

Expect `SEO check passed` with sitemap and representative counts. For every page
sampled by the script, capture its head values and review them against the
[SEO helper](../../../app/helpers/seo.ts): canonical and `og:url` use the concrete
page path and target origin; en-SG and x-default use the unprefixed path, while
zh-Hans, ms and ta use their locale prefix. Reject literal route parameters such
as `/history/$year` even when canonical and `og:url` match each other. Record
expected and actual URLs, including every alternate `href`, with the crawl.
The guarded crawl uses GETs; the full sitemap crawl can be lengthy.
`SEO_CHECK_TIMEOUT_MS` overrides the 25-second per-request limit. This remains a
manual check requiring a running app, outside the normal verification command.

## Validation and Acceptance

Every sitemap `<loc>` has the selected deployment's origin and returns 200
without redirects or timeout. Representative HTML has one nonempty description,
title, canonical URL and matching `og:url`,
with en-SG, zh-Hans, ms, ta and x-default alternates. Each sampled page's recorded
canonical, `og:url` and alternate `href` values match its expected concrete URLs
under the locale policy; a passing smoke message alone does not establish this.
No `WIP` placeholder or literal history parameter appears. Primary-locale redirects agree with policy;
Markdown routes and `llms.txt` retain their existing behavior.

## Idempotence and Recovery

Crawls and origin checks can be repeated without writes. The local facts task
rebuilds snapshots and can be retried on the disposable database. Keep failed URLs
and timing context before rerunning; do not hide valid canonical history to mask slow reads.
For a later metadata regression, revert the focused change and rerun against
the same dataset and deployment configuration.

## Artifacts and Notes

Still required: exact deployment SHA, UTC crawl time, origin-guard result,
sitemap/representative counts, each sampled page's expected/actual metadata URLs,
failures or passing output and any blocked coverage. The
[June/July record](../completed/seo-foundations.md) is obtained local evidence,
not a current production receipt.

## Interfaces and Dependencies

The [smoke script](../../../app/scripts/checkSeo.ts) owns its checks and sample
paths. The [sitemap reader](../../../app/util/dbQueries/sitemap.ts) requires a
completed projection. Shared metadata and canonical history tests protect source
policy; a live crawl establishes routability on the target environment.
