# Verify Reddit monitor integration and cutover

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Prove that a source-specific monitor discovers useful Reddit posts and replies
and delivers each as a safe programmatic crowd report. The site contract and
monitor runtime exist in source, and the crawler source already removed Reddit.
Remaining work is to reconcile deployed state and record coverage/cutover evidence.

## Progress

- [x] (2026-07-18–19) Implement site endpoint and v1 producer catalog; retain
  the [delivery record](../completed/programmatic-crowd-reports.md).
- [x] (2026-11-26) Inspect sibling monitor runtime and crawler removal in source.
- [ ] Reconcile actual deployments and recover existing rollout evidence.
- [ ] Compare shadow discovery, parsed replies, retries and moderation.
- [ ] Verify a complete 24-hour thread workflow and one active delivery path.

## Surprises & Discoveries

July 17 sampling found about 54 posts/day across two target subreddits but only
one to three genuinely live operational threads/month. Roughly 77–88% of sampled
replies arrived within three hours. This supports a small initial cadence, but
old sampling does not prove current discovery coverage.

The local crawler at `d1b2e1c648b3493441bd1b95ed24dd5b3dca27b1` has no Reddit
source; [removal commit](https://github.com/foldaway/mrtdown-data-crawler/commit/56c37817a7911ab17559c38a857d6d0b02433cd7)
dates to July 29. The monitor at `a2df9fe5a8eacfbf98800a18868dfb9c010813f1`
has public-shadow discovery, parsing, delivery and fixed reply Workflows.
Its runtime explicitly rejects OAuth as unimplemented. Neither checkout proves
what is deployed or that the original cutover gates passed.

## Decision Log

- 2026-07-17–19 — Keep discovery/state in a dedicated Worker; submit independent
  structured reports through the existing site pipeline. Use generic producer
  provenance and stable external IDs rather than a second claim lifecycle.
- 2026-07-18 — Retain the crawler until equivalent discovery and useful reply
  handling are demonstrated. This is the original gate; source removal alone
  does not establish that it passed.
- 2026-07-19 — Use the small authenticated catalog; defer OpenAPI/client generation
  until multiple real producers or observed drift justify it.
- 2026-11-26, documentation review — Do not schedule already-delivered crawler
  removal or monitor implementation again. Recover existing rollout evidence
  and validate remaining runtime outcomes.

## Outcomes & Retrospective

Site and monitor source delivery plus crawler source removal are verified by
inspection; deployment, shadow comparison and cutover acceptance are unverified.
This documentation review did not contact Reddit, provision credentials or
change dispatch.

## Context and Orientation

The [producer contract](../../architecture/data-pipeline.md#programmatic-crowd-reports)
owns credentials, request examples and responses. The sibling
`mrtdown-reddit-monitor` owns Reddit transport, D1 conversations, parsing, polling
and delivery state. Its `src/runtime/scheduled-discovery.ts` and
`src/runtime/reddit-thread-workflow.ts` wire the implemented public-shadow path.
The crawler's `src/sources/rss.ts` now contains Mastodon/news feeds, not Reddit.
Public/canonical output may need isolation for shadow evaluation because accepted
producer reports normally trigger dispatch.

## Plan of Work

Inspect the monitor/crawler revisions and environments first. Configure a
producer and endpoint in a disposable or staging setup with dispatch output
explicitly controlled. Public-shadow describes the Reddit transport, not a
guarantee that site output is disabled. Recover the incumbent's dated discovery
baseline or define a reviewed replacement sample, then inspect useful replies,
observation times, resolution (`isStillHappening: false`) and irrelevant discussion.

The implemented cadence is +10, +25, +40, +55 minutes, +3, +6 and +24 hours;
change only with evidence of missed updates or wasted work. Each useful reply has its own
stable external ID. Record retry/replay and moderation outcomes.

Recover trust/coverage approval and cutover receipts if they exist. Otherwise
validate them in the isolated target before any runtime change. Observe one full
24-hour workflow and confirm only one deployed source submits Reddit reports.
Do not repeat source removal; source absence cannot prove the live crawler stopped.

## Concrete Steps

From the site root with dependencies and disposable test services configured:

```sh
npm run verify
```

Expect authentication, schema/reference, idempotency, dispatch and public-route
regressions to pass. Follow the producer guide for authenticated catalog GET and
report POST requests in the isolated target; POST persists and can dispatch.
In the sibling monitor root, run its deterministic check and, for an isolated
local runtime with local D1/configuration and output controlled, its dev server:

```sh
npm ci
npm run check
npm run dev
```

These are existing scripts. Dependencies install locally; checks use synthetic
fixtures. Dev execution can reach external Reddit/AI/site services when configured.
Consult that repository's README and rollout procedure before any deployed canary;
this plan does not introduce a shadow-output flag or authorize deployment.

## Validation and Acceptance

A relevant post survives rediscovery/retry without duplicate site or canonical
reports. A useful reply becomes a distinct correctly timed update; resolution
is preserved. Identical producer/external-ID retries return the original result,
conflicting payloads return 409, and public protections remain intact. Reviewers
accept discovery coverage, irrelevant-report rate and trust policy before cutover.
A full 24-hour workflow and single active delivery path prove the final outcome.

## Idempotence and Recovery

Keep producer/external IDs stable across retries. Treat 400/409 as contract
errors to inspect rather than endlessly retrying; handle authentication/server
failures through the monitor's recorded policy. Retain conversation/delivery state.
On runtime failure, pause monitor delivery and preserve pending D1 state. The
current crawler source cannot serve as a Reddit fallback; select and review an
explicit compatible prior revision before restoration, and reconcile overlap
so two paths do not submit duplicates. Rotate producer credentials independently of scheduled site-task credentials.

## Artifacts and Notes

The [site delivery record](../completed/programmatic-crowd-reports.md) retains
July findings and decisions. The sibling SHAs above identify obtained source
evidence; still required are deployed SHAs, target settings without secrets,
comparison window/counts, reply/retry examples, trust approval,
24-hour run receipt and rollback-window decision. No production cutover is inferred.

## Interfaces and Dependencies

[Runtime request schema](../../../app/util/programmaticCrowdReports.ts),
[persistence tests](../../../app/util/programmaticCrowdReportPersistence.test.ts)
and [catalog](../../../app/util/referenceCatalog.ts) own the site boundary.
Reports share moderation, clustering and dispatch; the monitor owns source and
polling state. Do not add Reddit-specific tables, fake IP abuse records, a parallel
signal lifecycle or an OpenAPI package for this integration.
