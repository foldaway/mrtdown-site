# Rotate or verify a timetable import

A deployment pin identifies approved artifact bytes; it does not approve an
unseen source release. Coordinate source, pin, retained lineage and schedules
before an import. The [pipeline guide](../architecture/data-pipeline.md#timetable-admission)
owns admission, request schema and projection contracts. This guide owns rotation
and replay operation; the [fresh-build plan](../plans/active/successor-projection-builds.md)
owns remaining runtime/retry acceptance.

## Prepare the target

Record the exact environment/deployed SHA, source URL, independently approved
archive and index digests, retained predecessor receipt and schedule state.
Verify lineage against the target environment, not another environment's receipt.
Production deploy, production import and public Pages publication each require
their own explicit go-ahead. Recheck live state before those actions.

Preview resets its database on deploy. Before changing a shared Pages source,
inspect the actual preview importer and choose either an isolated canonical-only
source or a compatible importer with its own approved baseline and pin. The
November decision to leave preview unchanged is historical; a staging successor
review does not authorize a reset preview baseline.

## Rotate and verify

1. Pause the affected recurring pull and drain active callbacks. Preserve the
   original source, pin and schedule settings for recovery.
2. Set the deployment environment's `MRTDOWN_COMBINED_RELEASE_INDEX` from the
   independent approval, arrange the exact matching source archive, then deploy
   the intended revision. Normal deploy syncs schedules; check pause state again.
3. Start an authenticated one-off pull with source review for an unseen release.
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

Before the empty replay, configure the disposable target's deployment pin
(`MRTDOWN_COMBINED_RELEASE_INDEX`) with the independently approved index and
use the matching source archive. Confirm the running app received that pin;
an index supplied only to an earlier one-off import does not configure it for
this empty request.

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

Drain callbacks before changing a pin/source again. An old signed request can
conflict with a new pin. Restore temporary staging settings when the experiment
ends. To return to canonical-only input, clear the pin and deploy that source
before resuming pulls; this preserves retained releases and projections. Do not
manually delete retained receipts or mutate departure rows to force acceptance.
