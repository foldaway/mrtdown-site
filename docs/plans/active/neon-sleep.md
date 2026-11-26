# Verify sustained Neon sleep between canonical changes

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Serve ordinary public requests and unchanged scheduled work without opening
Postgres, then demonstrate sustained provider suspension under ordinary traffic.
Source paths exist for the audited route families; production-wide sleep has
not been established. Recovery, administration and real writes may use SQL.

## Progress

- [x] (2026-11-26 review) Confirm published paths for ranges, arrivals, reports,
  sitemap, profiles/directories, statistics, report references and idle dispatch.
- [x] Preserve the separately verified range/arrival production rollout in the
  [delivery record](../completed/published-serving-inputs.md).
- [ ] Check the deployed revision and publication readiness for later slices;
  coordinate their review/rollout separately.
- [ ] Audit remaining ordinary traffic and background wake-ups on that revision.
- [ ] Record a representative provider observation window and sustained sleep.

## Surprises & Discoveries

Bulk topology caches did not establish sleep: readers still checked SQL
freshness and scheduled pulls acquired a lease before comparing inputs. A valid
cache hit must avoid connection acquisition as well as row reads. The original
production rollout exhausted QStash's 1,000-message quota; its obsolete DLQ run
must not be resumed. See the dated delivery record for exact identities.

## Decision Log

- 2026-11-21, user — Prioritize sustained Neon sleep while mrtdown-data is
  unchanged; reduced transfer alone is not acceptance.
- 2026-11-21, Codex — Publish raw canonical range inputs, not a clock-frozen
  assembled dataset. Retain the active immutable snapshot until superseded;
  requests read its Redis pointer without a SQL generation check. SQL remains
  the recovery path for missing/unavailable snapshots.
- 2026-11-26, documentation review — Consolidate remaining acceptance here.
  Keep source delivery and local parity separate from deployment and provider
  evidence; optional historical egress attribution lives in tech debt.

## Outcomes & Retrospective

The [delivery record](../completed/published-serving-inputs.md) preserves exact
production receipts, manifest digests, corpus measurements and local checks.
Source coverage now includes later audit groups; this review did not deploy or
measure provider sleep. Whole-site acceptance remains open.

## Context and Orientation

Canonical SQL remains the relational model. Completed writer publications put
bounded immutable inputs behind atomic Redis heads; request-time assembly retains
clock-dependent behavior. Missing/invalid inputs use SQL recovery with `no-store`.
An unchanged poll verifies publication readiness before taking a SQL lease.
The [cache runbook](../../operations/edge-caching.md) owns repair and limits;
the [pipeline](../../architecture/data-pipeline.md) owns ordering and freshness.
A deployment must contain the expected publishers and readers, not just a merged PR.

## Plan of Work

First identify the exact deployed SHA, Redis configuration and completed
publication generations. Verify each later route slice against SQL in an isolated
environment before its separately authorized rollout. Drain older unfenced writers
before initializing community queue proofs.

Then trace ordinary home/profile/directory/history/statistics/sitemap, arrival
polling and report-detail requests plus unchanged canonical/holiday polls and
idle dispatch. Separate genuine writes, unknown-ID recovery, cache faults and
admin calls from routine reads. Correct only observed wake-ups with their own
parity and publication checks.

Finally observe provider compute state and compute-time accounting across
representative ordinary traffic. Agree and record the window duration and route
mix before measurement; it must span multiple 300-second idle opportunities.
Use external provider telemetry rather than a SQL monitoring loop. Compare Redis
usage and response health as well as compute, and explain every remaining wake-up.

## Concrete Steps

From the repository root, install dependencies and follow the disposable-service
setup in the [quality guide](../../development/quality.md), then run:

```sh
npm run verify
```

Expect no failed checks and no integration skips with the two test URLs set.
For publication repair, follow the authenticated procedures in the cache runbook;
those mutate the selected environment and require its deployment context.
Provider inspection has no repository CLI wrapper: record the selected project,
branch, deployed SHA, UTC window and exported compute/Redis metrics. Do not run
SQL probes during the idle observation.

## Validation and Acceptance

Healthy cold and warm public loaders must work with SQL access throwing,
including moving date windows, aliases, empty results and expiry. Unchanged
polls and certified-empty dispatch must acquire no SQL handle. Changed inputs,
explicit repair, real writes and unavailable publications must retain coherent
fallback and publication ordering. Local tests establish these invariants;
provider suspension and reduced compute time under normal traffic establish the
production outcome. A few SQL-free probes or a merged cache PR cannot close it.

## Idempotence and Recovery

Repeat read-only audits freely. Repair missing publications through their
owning writer; retain the last coherent head during failed or partial publication.
Use the runbook for dirty community caches, pending holiday facts and invalid key
types. If a rollout fails, restore a compatible application revision and repair
under the writer fence; never resume obsolete workflow inputs. Retain source
receipts, timetables and the pre-change telemetry for comparison.

## Artifacts and Notes

Obtained evidence is in [published serving inputs](../completed/published-serving-inputs.md).
Still required: later-slice deployment SHA/run links, publication generations,
route/background coverage, provider window boundaries, suspension observations,
compute-time and Redis cost comparison, and any remaining exception. Do not
replace dated evidence with assumptions about today's production state.

## Interfaces and Dependencies

The [pull preflight](../../../app/workflows/pull/helpers/publishedInputs.ts)
and [pull workflow](../../../app/workflows/pull/index.ts) own unchanged-input
admission and publication. [Published store](../../../app/util/publishedSnapshotStore.server.ts)
owns atomic heads; [dispatch](../../../app/util/crowdReportDispatch.ts) owns
queue discovery. Preserve timetable admission, redaction, report freshness,
request-clock assembly and SQL recovery. Production provider access and separate
rollout authorization are prerequisites to closing this plan.
