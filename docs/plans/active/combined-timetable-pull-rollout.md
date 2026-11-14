# Combined timetable pull rollout

## Context

The November 9–30, 2026 Singapore release committed its production departure
projection, but QStash reported failure after the parse callback timed out.
The expensive writes ran again on callback retry. The canonical-only and
combined archives can have identical canonical manifest inputs, so the managed
empty-body pull also needs an independent release pin before it can tell the
fingerprints apart.

## Goals

- Complete a signed staging pull for the exact retained release on normal
  Fly sizing, record the combined fingerprint and leave departures untouched.
- Give each environment its own deploy-managed index and keep source review
  mandatory when that environment has never retained the release.

## Phases

### Verify staging replay

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

## Follow-up

Fresh releases and missing-date repairs can still require a large transaction.
Design bounded, resumable writes for those builds after verifying the retained
release replay.
