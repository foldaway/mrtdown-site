# Combined timetable pull rollout

## Purpose

Keep Fly’s scheduled pulls reliable when an approved combined timetable is
released. Verify reuse of retained projections and measure the fresh-build path
for successor releases. Give each environment a deploy-managed index and retain
source review for releases that environment has never imported.

## Progress

- [x] Verify retained November projection replay in staging (2026-11-12).
- [x] Verify retained projection replay in production and publish the approved
  November release to Pages (2026-11-12).
- [ ] Measure a fresh projection build in staging while preparing the
  successor to the November 9–30 release. Use the result to scope bounded,
  resumable writes for fresh releases and missing-date repairs.

## Surprises & Discoveries

The production November projection committed before QStash timed out. Callback
retry repeated the expensive writes. The canonical-only and combined archives
can share canonical manifest inputs, so an empty-body scheduled pull also
needs the approved release pin to distinguish their fingerprints.

## Decision Log

- 2026-11-12 — Use an independently approved deploy-managed pin per environment.
  Source review still governs admission of an unseen release, as described in the
  [data pipeline guide](../../architecture/data-pipeline.md).
- 2026-11-12 — Keep preview on its existing source for the November release.

## Outcomes & Retrospective

[PR #301](https://github.com/foldaway/mrtdown-site/pull/301) enabled reuse of
verified retained projections. Both staging and production replays reached
`RUN_SUCCESS`, preserved departure writes, and skipped parse on a repeat pull.
The [Pages publication run](https://github.com/foldaway/mrtdown-data/actions/runs/43579812606)
published 22 Singapore service dates with 149,256 assigned trip/date pairs
and zero unassigned. Daily staging and production schedules were verified
active after publication.

## Context

The [data pipeline guide](../../architecture/data-pipeline.md) describes the
importer, approved pin, retained receipts, and departure index. The replay
procedure below uses the November 9–30, 2026 Singapore release as its reference
fixture. Use the corresponding approved archive and provenance for a successor.

## Plan of Work

### Verify staging replay (November procedure)

1. Confirm the deployed revision, source URL, retained receipt, both release
   index digests and projector metadata. Verify the release's 22 Singapore
   service dates, 149,256 trip/date pairs and zero unassigned. Record the
   projection ID, topology digest and version, completion timestamp and
   occurrence/membership write counters before the run. Confirm the combined
   fingerprint is absent or differs from the expected one; a no-op would not
   exercise reuse. If it is already current, use a disposable staging database
   branch with the retained projection and only the fingerprint entry removed.
2. Coordinate the staging schedule and drain active callbacks before changing
   the source or deploying. Set `MRTDOWN_COMBINED_RELEASE_INDEX` in the
   staging GitHub deployment environment using the independently approved
   index. Serve the exact approved archive from a staging-accessible origin
   and deploy with normal shared Fly sizing. Confirm the schedule state after
   deploy's schedule sync.
3. Send a signed empty pull to the staging workflow (or let the managed
   schedule deliver one in a controlled window). Do not send a review, request
   index or rebuild flag. Follow the run through `parse`,
   `record-manifest-fingerprint` and lease release to `RUN_SUCCESS`.
4. Recompute the expected fingerprint from the canonical manifest and approved
   index. Check the stored value and confirm the first receipt, projection
   ID, completion timestamp, day counts and departure write counters are
   unchanged. Check Expo EWL platform A with LTA attribution and the
   November 30 BPLRT departure at December 1 00:01:30 SGT. Send a second empty
   pull and check that it skips parse and finishes successfully.
5. Restore temporary staging source, pin and schedule settings unless staging
   is intentionally adopting this source. Keep release inputs and review
   records in the approved private locations.

### Coordinate rotation and production cutover

- Pause and drain pulls before switching source and pin. Verify the new
  archive and index through the independent approval path and check the
  environment's current retained predecessor. Deploy with the new pin, verify
  the source agrees, and trigger the signed one-off pull with the review for
  an unseen release. Resume the managed schedule after success. A matching pin
  gives the daily pull the artifact identity; it does not approve a new source.
- To switch back to a canonical-only source, clear the pin and deploy with
  that source before resuming the schedule. This does not delete a retained
  release or its projection.
- Production deploy, production import and public Pages publication each
  require explicit go-ahead. Verify live lineage, deployment, schedule and
  source state again before those operations.

### Choose the preview source before shared Pages publication

- Keep the July importer on a separate canonical-only source that cannot pick
  up the combined ZIP when the shared Pages source changes. This keeps preview
  resets independent of timetable approval.
- Or upgrade preview to the current importer and configure its own pin and
  approved baseline input after each reset. Preview's deploy workflow resets
  its database, so neither staging's successor review nor a previous preview
  receipt can serve as the baseline. Validate fresh-build runtime on that path.

### Successor releases and repairs

Fresh releases and missing-date repairs can still require a large transaction.
Design bounded, resumable writes for those builds after verifying the retained
release replay.

## Validation and Acceptance

- Run `npm run verify` after changes to the importer or projector.
- For replay, require `RUN_SUCCESS`, the expected fingerprint, and unchanged
  receipt, projection ID, service-day totals, and write counters. A repeat
  empty pull should skip parse.
- For a fresh build or date repair, capture runtime and retry behavior in
  staging. Compare service-date coverage and assigned trip/date counts with
  the approved release and probe representative station departures.
