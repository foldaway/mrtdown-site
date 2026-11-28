# Rotate or verify a timetable import

A signed one-off request identifies approved artifact bytes; it does not approve an
unseen source release. Coordinate source, retained lineage and schedules
before an import. The [pipeline guide](../architecture/data-pipeline.md#timetable-admission)
owns admission, request schema and projection contracts. This guide owns rotation
and replay operation; the [fresh-build plan](../plans/active/successor-projection-builds.md)
owns remaining runtime/retry acceptance.

## Prepare the target

Record the exact environment/deployed SHA, source URL, independently approved
archive and public index digests, retained predecessor receipt and schedule state.
Verify lineage against the target environment, not another environment's receipt.
Production deploy, production import and public Pages publication each require
their own explicit go-ahead. Recheck live state before those actions.

Preview resets its database on deploy. Before changing a shared Pages source,
inspect the actual preview importer and choose either an isolated canonical-only
source or a compatible importer with its own approved baseline. The
November decision to leave preview unchanged is historical; a staging successor
review does not authorize a reset preview baseline.

## Rotate and verify

1. Pause the affected recurring pull and drain active callbacks. Preserve the
   original source and schedule settings for recovery.
2. Publish the reviewed release through mrtdown-data Pages. Check that its
   public index, publication receipt and archive agree. Normal deploy syncs
   schedules; check pause state again if deploying the importer.
3. Start or observe the site pull. Ordinary releases use the public source
   review; a reviewed exception can supply an exact review in the request.
   Follow its returned run ID to `RUN_SUCCESS`, checking the exact release index
   receipt, fingerprint and lease release. HTTP 202 alone is not completion.
4. Verify service-date coverage and assigned/unassigned counts against the
   approved release. Probe representative station/platform departures and the
   final day's overnight tail. Resume the managed schedule only after success.

Task POST/GET shapes and authentication are defined by the
[pull route](../../app/routes/internal.api.tasks.pull.ts) and
[request schema](../../app/workflows/pull/helpers/pullParams.ts).
Keep private source/review bytes out of deployment variables and schedule bodies;
the recurring pull retains an empty body. Long imports use the direct signed
`PULL_WORKFLOW_URL` described in the pipeline guide.

## Prove retained replay

Record the first receipt, projection ID, topology digest/version, completion time,
service-day counts and occurrence/membership write counters. To exercise reuse,
the combined fingerprint must differ or be absent; an unchanged preflight alone
does not test the projector. If already current, use a disposable staging copy
with retained projection and only its fingerprint removed, not a shared database.

Before the empty replay, retain the approved release and use the matching public
source archive. The workflow reads the current public index again.

Send an empty pull without source review, request index or rebuild flag. Require
success, the expected canonical-plus-index fingerprint and unchanged recorded
projection/receipt/write counters. A second empty pull should skip parse.
The [November record](../plans/completed/combined-timetable-pull-rollout.md)
provides a dated verified fixture, not a timeless release target.

## Retry and recovery

Admission may retain the first receipt even when projection or later work fails.
Keep those bytes and lineage intact. If the upstream archive changed mid-run,
restore the expected artifact for retry or start a new pull with the new manifest
and review. Use the explicit projection rebuild flag only for intentional repair;
it bypasses both fingerprint skip and reuse.

Drain callbacks before changing the source again. Restore temporary staging
settings when the experiment ends. A transition from a retained combined release
to canonical-only input needs an explicit importer change before resuming pulls.
Do not
manually delete retained receipts or mutate departure rows to force acceptance.
