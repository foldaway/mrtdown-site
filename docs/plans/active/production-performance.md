# Verify production latency and payload targets

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Measure the current Fly application against warm TTFB targets of under 750 ms
for home and 1.5 s for statistics, and under 250 KB uncompressed first-load HTML
for each. Preserve mobile/desktop and locale behavior while identifying any
remaining bottleneck.

## Progress

- [x] (2026-11-26 review) Confirm instrumentation, scoped payloads, deferred
  widgets, client date-window expansion and persisted statistics in source.
- [ ] Collect current cold/warm route timings, payloads and browser behavior.
- [ ] Fix measured gaps separately, rerun the comparison and record acceptance.

## Surprises & Discoveries

The May Worker baseline predates Fly, Cloudflare caching and published inputs;
it cannot serve as a controlled current comparison. Route probe bytes are decoded
response bytes; compressed transfer and SQL egress are different measurements.

## Decision Log

- 2026-07-12 — Use origin freshness headers and Cloudflare tags, superseding
  Worker Cache API caching.
- 2026-11-26, documentation review — Close implemented phases in the
  [foundation record](../completed/performance-foundations.md); retain numerical
  acceptance here and keep SQL sleep acceptance in its own plan.

## Outcomes & Retrospective

Source foundations are delivered. No fresh latency, Web Vitals, payload or
production cache measurement was collected in this review. The
[May investigation](../../investigations/2026-05-21-site-slowness.md) and
[foundation record](../completed/performance-foundations.md) retain dated evidence.

## Context and Orientation

The [route probe](../../../app/scripts/checkRouteTimings.ts) reports status,
TTFB, decoded bytes, content type and cache/timing headers. The
[cache runbook](../../operations/edge-caching.md) explains edge versus origin
behavior. Home SSR uses a 30-day baseline and expands on the client without a
viewport navigation; statistics uses a persisted rebuild clock.

## Plan of Work

Capture the deployed SHA, source/publication state, region, sample count and
clock before probing. Separate edge hits, origin misses and cold processes;
compare like traffic and cache states. Inspect Server-Timing and browser network
traces before selecting another optimization. If a target fails, make a focused
change with regression evidence rather than replaying the old implementation
phases. Check statistics/profile deferred widgets and home expansion at mobile
and desktop sizes.

## Concrete Steps

From the repository root with dependencies installed:

```sh
npm run verify
SAMPLES=3 PROBES=all npm run perf:routes -- https://www.mrtdown.org
curl --compressed -L -s -D /tmp/mrtdown-statistics.headers -o /tmp/mrtdown-statistics.html https://www.mrtdown.org/statistics
wc -c /tmp/mrtdown-statistics.html
```

The probe sends ordinary public GETs and prints timing/header rows; curl writes
local evidence files. Repeat the byte check for home. A cold-process test needs
an isolated app instance; do not restart production merely to get a sample.

## Validation and Acceptance

Record cold and warm distributions separately, not just one favorable sample.
Warm home/statistics meet the stated TTFB and decoded HTML targets with correct
cache headers. Desktop home expands without `?viewport=*` navigation; localized
labels, issue cards and deferred charts/maps still render. Record normalized
route Web Vitals from production telemetry if available, and disclose missing
access. General speed work must preserve the SQL-free serving invariants.

## Idempotence and Recovery

GET probes are repeatable and local output files can be replaced. Avoid cache
purges or restarts during baseline capture. For later code changes, retain the
previous revision and compare under the same conditions; revert a regressing
change through the normal deployment procedure.

## Artifacts and Notes

Keep exact measurement windows, SHA, region, cache states, sample rows, byte
counts and browser observations with the implementation review. The
[original plan](https://github.com/foldaway/mrtdown-site/blob/fdf2a7b8effd7916f85c7e990b8b50ed7540fc96/docs/plans/active/production-performance.md) preserves obsolete phases
and the May 22 baseline (home 0.92–2.44 s, statistics 7.15–10.99 s TTFB).

## Interfaces and Dependencies

Owning paths are the route probe, [server instrumentation](../../../app/server.ts),
[statistics reader](../../../app/util/dbQueries/statistics.ts) and
[deferred widget](../../../app/components/DeferredViewportWidget.tsx).
Cloudflare, Fly and PostHog telemetry availability affects attribution, not the
public response contract. [Neon sleep](neon-sleep.md) owns compute acceptance.
