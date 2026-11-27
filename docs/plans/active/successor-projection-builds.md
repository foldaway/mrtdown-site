# Measure and bound fresh timetable projection builds

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Measure a fresh approved timetable projection and missing-date repair in staging,
then make writes resumable if runtime/retry evidence requires it. Reuse of retained
November projections is already verified; that does not establish fresh-build
reliability for the successor to the November 9–30 release.

## Progress

- [x] (2026-11-12) Verify retained projection replay in both environments;
  preserve [November evidence](../completed/combined-timetable-pull-rollout.md).
- [ ] Select an approved successor and isolate a staging fresh-build experiment.
- [ ] Record runtime, write counts and retry behavior; decide bounded writes.
- [ ] If needed, implement resumability and prove fresh/repair acceptance.

## Surprises & Discoveries

The November projection committed before QStash timed out; callback retry repeated
expensive writes. Retained replay avoids that work, while a new release or missing
date can still require a large transaction. Canonical-only/combined archives can
share manifest inputs, so the approved index participates in fingerprinting.

## Decision Log

- 2026-11-12 — Use independently approved per-environment release pins; unseen
  releases still need source-order review. Keep preview on its existing source
  for that November release.
- 2026-11-26, documentation review — Separate completed replay from fresh-build
  acceptance; routine rotation belongs in the operating guide. A staging result
  does not authorize production import or Pages publication.

## Outcomes & Retrospective

The [replay record](../completed/combined-timetable-pull-rollout.md) contains the
22-date, 149,256-assigned-pair November result and Pages run link. No fresh
successor runtime or recovery experiment was collected in this review.

## Context and Orientation

The [projector](../../../app/util/dbQueries/projectScheduledTimetable.ts) writes
occurrences, memberships and coverage transactionally from retained approved
bytes. Reuse requires matching release, topology, projector version and dates.
The [pipeline guide](../../architecture/data-pipeline.md#projection-and-repair)
owns these contracts. Use a disposable staging database for experiments; do not
remove shared production fingerprints to force a run.

## Plan of Work

Select the independently approved successor archive/index and source review
against the target's retained predecessor. Record the environment, exact deployed
SHA, source digest, projection metadata and schedule state. Coordinate staging
writers using the [rotation guide](../../operations/timetable-imports.md).

Exercise a fresh build with normal shared Fly sizing and direct signed workflow
routing. Record per-step/runtime and write totals, then exercise a controlled
retry and missing-date repair in the isolated target. Confirm whether a commit
before callback timeout repeats work. Decide the transaction/checkpoint boundary
from this evidence, preserving complete-publication selection.

If needed, design bounded resumable writes with explicit ownership/checkpoints
before implementation; a partial build must remain unavailable. Keep retained
receipt and departure selection semantics unchanged. Repeat acceptance and record
the decision even if measurement shows no code change is needed.

## Concrete Steps

From the repository root with dependencies and disposable test URLs configured:

```sh
npm run verify
```

Expect projector/selection/retry integration checks to pass without skips. For
staging, use the authenticated pull task and exact-run completion GET described
in the pipeline guide; capture `workflowRunId` and the successful release index.
`rebuildScheduledTimetableProjection: true` is an intentional write/repair flag,
not a routine replay test. Record exact private test invocations and approved
inputs with the review; no generic successor command is safe before selection.

## Validation and Acceptance

Require `RUN_SUCCESS`, the expected fingerprint/index and approved service-date
coverage/assigned trip-date totals, with representative station departures and
the final service day's overnight tail. Covered zero-active dates and untimed
stops must retain existing completeness policy. Record fresh-build runtime and
retry behavior; any chosen resumable design avoids duplicate writes and hides
partial state. A second unchanged pull skips parsing. Deployment, admission and
public publication are separate gates.

## Idempotence and Recovery

Retain original release bytes and first receipt even after failed projection.
Retry the expected archive, or start a new reviewed pull if upstream changed.
The existing transaction rolls back partial departure writes and leaves an
incomplete projection unavailable; test any new checkpoint design's cleanup and
retry before rollout. Restore temporary source, pin and schedule settings and
drain old callbacks before rotation. Never reuse another environment's review.

## Artifacts and Notes

Obtained: [November replay/publication](../completed/combined-timetable-pull-rollout.md).
Required: successor identity and review, predecessor receipt, deployed SHA,
projection/digest/write counters, runtime and timeout/retry receipts, departure
probes, and the bounded-write decision. Keep approvals and private input bytes in
their approved locations; link exact identities without publishing secrets.

## Interfaces and Dependencies

The [pull request schema](../../../app/workflows/pull/helpers/pullParams.ts),
[projection schema](../../../app/db/scheduledDepartures.schema.ts), retained
lineage and selection policy are compatibility boundaries. QStash callback timing,
Fly idle response limits and preview database resets affect the experiment.
Resolve checkpoint semantics before dependent implementation; do not invent
release admission from a deployment pin alone.
