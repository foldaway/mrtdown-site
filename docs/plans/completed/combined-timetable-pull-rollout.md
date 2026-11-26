# Combined timetable replay and November publication

## Verified November 12, 2026

[PR #301](https://github.com/foldaway/mrtdown-site/pull/301) enabled reuse of
verified retained projections. Both staging and production replays reached
`RUN_SUCCESS`, preserved departure writes, and skipped parse on a repeat pull.
The [Pages publication run](https://github.com/foldaway/mrtdown-data/actions/runs/43579812606)
published 22 Singapore service dates with 149,256 assigned trip/date pairs
and zero unassigned. Daily staging and production schedules were verified
active after publication.

The production November projection committed before QStash timed out. Callback
retry repeated the expensive writes. The canonical-only and combined archives
can share canonical manifest inputs, so an empty-body scheduled pull also
needs the approved release pin to distinguish their fingerprints.

## Decisions

- 2026-11-12 — Use an independently approved deploy-managed pin per environment.
  Source review still governs admission of an unseen release, as described in the
  [data pipeline guide](../../architecture/data-pipeline.md).
- 2026-11-12 — Keep preview on its existing source for the November release.

## Acceptance evidence and handoff

The replay preserved the first retained receipt, projection ID, completion time,
service-day totals and occurrence/membership write counters. Fingerprint matched
the canonical manifest plus independently approved index; the second empty pull
skipped parse. Representative checks included Expo EWL platform A with LTA
attribution and November 30's BPLRT tail at December 1 00:01:30 SGT.

These are dated rollout results, not proof of the current source, pin, schedules
or preview importer. [Original plan](https://github.com/foldaway/mrtdown-site/blob/fdf2a7b8effd7916f85c7e990b8b50ed7540fc96/docs/plans/active/combined-timetable-pull-rollout.md)
preserves the detailed November replay procedure and preview decision options.
[Timetable operation](../../operations/timetable-imports.md) owns future rotations;
[fresh projection acceptance](../active/successor-projection-builds.md) owns
remaining measurement and resumability work.
