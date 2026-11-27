# Performance foundations, May–July 2026

Source review on November 26 confirms scoped included-entity selection, a
30-day home baseline with client expansion, persisted statistics, deferred
widgets and route timing probes. This closes those implementation milestones;
[production performance](../active/production-performance.md) retains numerical
latency/payload acceptance. This record makes no fresh production claim.

## Evidence and decisions

- 2026-07-11 — Retire the Worker Cache API implementation for the move to Fly.
- 2026-07-12 — Use origin freshness headers and Cloudflare cache tags for public
  documents. See the [edge caching guide](../../operations/edge-caching.md).

The [original progress log](https://github.com/foldaway/mrtdown-site/blob/fdf2a7b8effd7916f85c7e990b8b50ed7540fc96/docs/plans/active/production-performance.md#progress-notes)
preserves the exact May 25–July 12 implementation and build observations,
including retired Worker caching, chart/map chunk names and June 13 Markdown
probes. On June 13 the public probes returned 200 Markdown; unsupported aliases
and Markdown Accept on HTML returned 500 before their source normalization to
404/406. Those results are historical, not current smoke-test results.

Current owners are [included selection](../../../app/util/dbQueries/includedEntities.ts),
[home route](../../../app/routes/{-$lang}/index.tsx),
[statistics](../../../app/util/dbQueries/statistics.ts),
[deferred widgets](../../../app/components/DeferredViewportWidget.tsx),
[route probes](../../../app/scripts/checkRouteTimings.ts), and the
[cache runbook](../../operations/edge-caching.md). Statistics now requires a valid
persisted snapshot; the old request-time fallback proposal is superseded.
