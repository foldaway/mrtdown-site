# Dynamic System Map Plan

## Context

`mrtdown-site` currently renders the system map from large hard-coded TSX
snapshots under `app/components/StationMap/components/Map*.tsx`. The snapshots
are selected by fixed timeline values in `StationMap`, and the map interaction
logic depends on SVG ids for line groups, station nodes, station labels, and
line segments.

The existing feasibility investigation is
`docs/investigations/2026-05-24-system-map-generation-feasibility.md`.

The preferred direction is a larger Opt 1/2 migration: keep schematic map data
canonical in `mrtdown-data`, then have `mrtdown-site` pull, validate, and render
that canonical schematic data. This keeps transit facts and schematic layout
versions in the same canonical data publication pipeline while leaving
site-specific rendering, status overlays, links, zoom, and interaction behavior
inside `mrtdown-site`.

## Goals

- Move system map authoring away from hard-coded generated TSX snapshots.
- Treat schematic map versions as canonical data published by `mrtdown-data`.
- Preserve manually designed map geometry, including line bends, curves, label
  placement, interchange composition, z-order, and one-off artistic decisions.
- Keep full snapshot map versions as the canonical storage contract; use deltas
  or copy-forward tooling only as authoring conveniences.
- Preserve the current `StationMap` interaction contracts until the renderer has
  a deliberate replacement for them.
- Support the existing fixed effective-date timeline first, then leave room for
  richer date selection once the data and renderer are stable.

## Non-Goals

- This plan does not make `mrtdown-site` the canonical owner of schematic data.
- This plan does not require automatic graph layout from transit topology.
- This plan does not require every map version to extend a previous version.
- This plan does not redesign the public system map UI before the data contract
  and renderer are proven.
- This plan does not remove the current generated snapshots until replacement
  rendering has visual and behavioral parity.

## Ownership Model

`mrtdown-data` should own:

- schematic map manifests and effective-date versions;
- schematic station positions and label placement;
- segment geometry, including raw SVG paths where needed;
- interchange node composition;
- visual layer order and semantic styling hints;
- validation that schematic references match canonical lines, stations,
  services, and station codes.

`mrtdown-site` should own:

- SVG/React rendering from the canonical schematic data;
- current disruption and focused-line overlays;
- station links, tooltips, localized labels, zoom controls, and timeline UI;
- route-level loading, caching, bundle strategy, and visual QA.

## Phases

### Phase 1: Cross-Repo Data Contract

- Draft the canonical schematic map schema in the `mrtdown-data` / `@mrtdown/core`
  boundary.
- Model map versions as complete snapshots keyed by effective date.
- Include explicit geometry primitives for common paths and raw SVG path escape
  hatches for hand-designed cases.
- Include stable semantic identifiers for line groups, station nodes, labels,
  and station-to-station segments.
- Define a manifest shape that lets consumers select the latest map version at
  or before a date.

Exit criteria:

- A proposed schema can represent one existing map snapshot without losing
  station placement, segment bends, label placement, or id contracts.
- The schema clearly separates transit topology from schematic layout.

### Phase 2: Canonical Authoring And Validation

- Add schematic map files to `mrtdown-data` as complete version snapshots.
- Add validation for unknown stations, unknown lines, duplicate segment ids,
  missing labels, orphan layout entries, and inconsistent effective dates.
- Add semantic diff tooling for reviewers: added/removed stations, moved
  stations, changed paths, changed labels, and changed layers.
- Add copy-forward tooling to start a new full snapshot from a prior version
  without making `extends` part of the canonical storage contract.

Exit criteria:

- At least one current system map version is authored and validated in
  `mrtdown-data`.
- Reviewers can inspect both semantic and visual changes without reading
  generated TSX.

### Phase 3: Archive And Read Model Import

- Publish schematic map data in the canonical archive consumed by
  `mrtdown-site`.
- Extend the site pull workflow and local read model to import map manifests and
  map versions.
- Keep the existing hard-coded `Map*.tsx` snapshots as the runtime fallback.
- Add query helpers that return map versions by effective date and by latest
  current date.

Exit criteria:

- `mrtdown-site` can load canonical schematic map data from its local read model.
- Import failures fail loudly without breaking current snapshot rendering.

### Phase 4: Data-Driven Renderer Spike

- Build a `SystemMapRenderer` that renders one canonical schematic map version
  to SVG.
- Preserve the current DOM id contract or introduce a compatibility adapter for
  the existing overlay logic.
- Render localized labels through site data, not duplicated map text.
- Support current status overlays and focused-line fading against rendered data.
- Add tests for generated ids and overlay behavior.

Exit criteria:

- One canonical map version renders in `mrtdown-site` with behavioral parity for
  station links, label localization, current incident fading, focused-line mode,
  and zoom controls.

### Phase 5: Visual Parity And Incremental Migration

- Compare renderer output against the corresponding existing `Map*.tsx`
  snapshot.
- Add visual regression checks for desktop and mobile viewports.
- Migrate remaining fixed timeline versions one at a time.
- Keep each migrated version reviewable through canonical data diffs and
  rendered screenshots.

Exit criteria:

- All current timeline versions render from canonical schematic map data.
- Existing hard-coded map snapshots are no longer needed for normal runtime.

### Phase 6: Cutover And Cleanup

- Remove hard-coded `Map*.tsx` imports from `StationMap`.
- Replace hard-coded timeline values with manifest-driven map versions.
- Update generated-file docs after snapshots are removed or reclassified as
  generated build artifacts.
- Revisit performance work for route splitting, caching, and payload size after
  data-driven rendering is in place.

Exit criteria:

- The system map route uses canonical schematic data end to end.
- The current fixed-date timeline behavior is preserved or deliberately
  replaced.
- No runtime path depends on the old hard-coded TSX snapshots.

## Progress Log

- 2026-05-24: Created plan after deciding that schematic map data should be
  canonical in `mrtdown-data`, with `mrtdown-site` responsible for rendering and
  interaction behavior.

## Decision Log

- 2026-05-24: Use complete snapshot map versions as the canonical storage
  contract because large schematic reflows make mandatory `extends` deltas hard
  to review and maintain.
- 2026-05-24: Allow raw SVG path geometry and explicit layer ordering so
  manually designed map choices are preserved rather than forced through an
  auto-layout algorithm.
- 2026-05-24: Keep rendering and interaction behavior in `mrtdown-site`; only
  schematic data and validation belong in the canonical data source.

## Validation

For site-side changes:

- Run `npm run verify`.
- Add focused renderer/id-contract tests while migrating `StationMap`.
- Use browser screenshots for visual parity on desktop and mobile.
- Manually verify `/system-map` and line profile focused-map cards.

For data-side changes:

- Run the `mrtdown-data` validation suite.
- Validate archive publication includes schematic map manifests and versions.
- Review semantic diffs and rendered visual diffs for each map version.
