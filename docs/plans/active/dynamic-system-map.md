# Dynamic System Map Plan

## Context

`mrtdown-site` currently renders the system map from large hard-coded TSX
snapshots under `app/components/StationMap/components/Map*.tsx`. The snapshots
are selected by fixed timeline values in `StationMap`, and the map interaction
logic depends on SVG ids for line groups, station nodes, station labels, and
line segments.

The existing feasibility investigation is
`docs/investigations/2026-05-24-system-map-generation-feasibility.md`.

The preferred direction is a larger Opt 1/2 migration: keep schematic map
generation canonical in `mrtdown-data`, then have `mrtdown-site` pull, validate,
and render generated schematic map data. This keeps transit facts, layout rules,
constraints, and generated schematic versions in the same canonical data
publication pipeline while leaving site-specific rendering, status overlays,
links, zoom, and interaction behavior inside `mrtdown-site`.

## Goals

- Move system map authoring away from hard-coded generated TSX snapshots.
- Treat generated schematic map versions as artifacts published by `mrtdown-data`.
- Treat the `mrtdown-data` generator implementation plus rule and constraint
  inputs as the canonical source of truth.
- Start with the `lta-system-map-2011` layout engine, reflecting the broad LTA
  map design era around the Circle Line-era map overhaul.
- Preserve LTA-style schematic design intent, including line bends, curves,
  label placement, interchange composition, z-order, and reviewed one-off
  exceptions, without requiring exact coordinate reproduction.
- Keep full generated snapshot map versions as the published storage contract;
  use deltas or copy-forward tooling only as authoring conveniences.
- Preserve the current `StationMap` interaction contracts until the renderer has
  a deliberate replacement for them.
- Support the existing fixed effective-date timeline first, then leave room for
  richer date selection once the data and renderer are stable.
- Explore a protected map designer experience that edits canonical schematic
  data through reviewed `mrtdown-data` pull requests instead of making
  `mrtdown-site` a direct data authority.

## Non-Goals

- This plan does not make `mrtdown-site` the canonical owner of schematic data.
- This plan does not require automatic graph layout from transit topology alone;
  generator rules and conservative reviewed constraints are expected.
- This plan does not require every map version to extend a previous version.
- This plan does not redesign the public system map UI before the data contract
  and renderer are proven.
- This plan does not expose canonical schematic writes directly to the public or
  bypass `mrtdown-data` review.
- This plan does not remove the current generated snapshots until replacement
  rendering has visual and behavioral parity.
- This plan does not require generated maps to exactly reproduce current
  hard-coded coordinates when a coherent LTA-style generated layout is visually
  acceptable.

## Ownership Model

`mrtdown-data` should own:

- schematic map manifests and effective-date versions;
- generator code, layout engine ids, and deterministic rule configuration;
- reviewed layout constraints, anchors, and explained exceptions, initially at
  station and line-segment scope;
- generated schematic station positions and label placement;
- generated segment geometry, including raw SVG paths where needed;
- generated interchange node composition;
- visual layer order and semantic styling hints;
- validation that schematic references match canonical lines, stations,
  services, and station codes.

`mrtdown-site` should own:

- SVG/React rendering from generated canonical schematic data;
- current disruption and focused-line overlays;
- station links, tooltips, localized labels, zoom controls, and timeline UI;
- protected map designer UI, if built, including constraint/exception editing
  and preview;
- schematic generator edit submission to `mrtdown-data` as a branch, draft pull
  request, or equivalent reviewed ingest workflow;
- route-level loading, caching, bundle strategy, and visual QA.

## Phases

### Phase 1: Cross-Repo Generator Data Contract

- Draft the schematic generator schema in the `mrtdown-data` / `@mrtdown/core`
  boundary, covering rule configuration, the `lta-system-map-2011` layout engine
  id, version constraints, generated manifests, and generated snapshots.
- Model generated map versions as complete snapshots keyed by effective date.
- Treat generated snapshots as committed/published artifacts; validation should
  detect stale generated output.
- Include explicit geometry primitives for common paths and raw SVG path escape
  hatches for reviewed exceptions.
- Store generated snapshots as structured map primitives for `mrtdown-site` to
  render, not as generated TSX.
- Include stable semantic identifiers for line groups, station nodes, labels,
  and station-to-station segments so the current `StationMap` interaction
  contract can survive the migration.
- Define a manifest shape that lets consumers select the latest map version at
  or before a date.

Exit criteria:

- A proposed schema can represent generated output equivalent to one existing
  map snapshot without losing station placement, segment bends, label placement,
  or id contracts.
- The schema clearly separates transit topology, generator rules, constraints,
  exceptions, and generated artifact coordinates.
- The initial constraint schema supports station-scoped and line-segment-scoped
  constraints without requiring per-station absolute coordinates.

### Phase 2: Generator Authoring And Validation

- Add generator rule/configuration files and generated schematic map snapshots to
  `mrtdown-data`.
- Start with `2025-04`, the current site default and a representative
  `3140 x 2400` map frame.
- Parse `MapApr2025.tsx` into a reference fixture for ids, geometry, label
  positions, node composition, viewBox, and layer order.
- Add validation for unknown stations, unknown lines, duplicate segment ids,
  missing labels, orphan layout entries, inconsistent effective dates, stale
  generated snapshots, and unexplained fixed coordinates.
- Validate structural parity first: ids, station coverage, service-edge coverage,
  duplicate ids, missing labels, and snapshot freshness. Defer visual pixel
  thresholds until the renderer exists.
- Add semantic diff tooling for reviewers: added/removed stations, moved
  stations, changed paths, changed labels, and changed layers.
- Add generator-diff tooling for reviewers: rule changes, constraint changes,
  exception changes, and fixed-coordinate count changes.
- Add copy-forward tooling to start a new generated version from shared general
  constraints without making `extends` part of the published snapshot storage
  contract.

Exit criteria:

- The `2025-04` system map version is generated and validated in
  `mrtdown-data`.
- Reviewers can inspect semantic, visual, and generator-source changes without
  reading generated TSX.
- Reviewers can distinguish generated coordinates, constraints, exceptions, and
  artifact coordinates.
- Reviewers can inspect parsed reference fixtures instead of reading the raw
  `Map*.tsx` snapshots.

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

- Build a `SystemMapRenderer` that renders one generated schematic map version
  to SVG from structured map primitives.
- Preserve the current DOM id contract or introduce a compatibility adapter for
  the existing overlay logic.
- Render interchange node composition with line-specific parts so overlays can
  continue fading individual line components inside station nodes.
- Render localized labels through site data, not duplicated map text.
- Support current status overlays and focused-line fading against rendered data.
- Add tests for generated ids and overlay behavior.

Exit criteria:

- The generated `2025-04` map version renders in `mrtdown-site` with
  behavioral parity for station links, label localization, current incident
  fading, focused-line mode, and zoom controls.

### Phase 5: Protected Map Designer Spike

Build an authoring surface only after the data-driven renderer is trustworthy.
The designer should be a protected/admin or local-development experience, not a
normal public page.

- Load generated schematic map data and render it with the same
  `SystemMapRenderer` used by the public map.
- Support focused editing of high-value generator inputs first: constraints,
  label anchors, segment bend hints, bezier handles for exceptions, and layer
  order.
- Surface semantic validation while editing: unknown references, duplicate
  segment ids, missing labels, orphan layout entries, and service-edge coverage.
- Preview current-status and focused-line overlays against the edited map.
- Export a schematic generator edit bundle that can be submitted to
  `mrtdown-data`.
- Submit changes to `mrtdown-data` as a reviewed branch or draft PR; never write
  directly to canonical data from the site runtime.

Exit criteria:

- A trusted maintainer can modify one map version visually, preview it with the
  site renderer, and produce a reviewed `mrtdown-data` change.
- The designer output is generator rules, constraints, exceptions, and
  regenerated snapshots, not generated TSX or site-private rendering state.

### Phase 6: Visual Parity And Incremental Migration

- Compare renderer output against the corresponding existing `Map*.tsx`
  snapshot.
- Add visual regression checks for desktop and mobile viewports.
- Migrate remaining fixed timeline versions one at a time.
- Keep each migrated version reviewable through canonical data diffs and
  rendered screenshots.

Exit criteria:

- All current timeline versions render from generated canonical schematic map
  data.
- Existing hard-coded map snapshots are no longer needed for normal runtime.

### Phase 7: Cutover And Cleanup

- Remove hard-coded `Map*.tsx` imports from `StationMap`.
- Replace hard-coded timeline values with manifest-driven map versions.
- Update generated-file docs after snapshots are removed or reclassified as
  generated build artifacts.
- Revisit performance work for route splitting, caching, and payload size after
  data-driven rendering is in place.

Exit criteria:

- The system map route uses generated canonical schematic data end to end.
- The current fixed-date timeline behavior is preserved or deliberately
  replaced.
- No runtime path depends on the old hard-coded TSX snapshots.

## Progress Log

- 2026-05-24: Created plan after deciding that schematic map data should be
  canonical in `mrtdown-data`, with `mrtdown-site` responsible for rendering and
  interaction behavior.
- 2026-05-24: Added protected map designer direction for visual authoring that
  submits reviewed canonical changes back to `mrtdown-data`.

## Decision Log

- 2026-05-24: Use complete snapshot map versions as the published storage
  contract because large schematic reflows make mandatory `extends` deltas hard
  to review and maintain.
- 2026-05-24: Allow raw SVG path geometry and explicit layer ordering so
  reviewed exceptions can be preserved rather than forced through an
  inappropriate generic auto-layout algorithm.
- 2026-05-24: Keep rendering and interaction behavior in `mrtdown-site`; only
  schematic data and validation belong in the canonical data source.
- 2026-05-24: Treat any map designer as an authoring client for
  `mrtdown-data`, similar in direction to crowdsourced report dispatch but with
  higher-trust access and PR review before canonical publication.
- 2026-05-25: Align with the data-side generator-first plan: the generator
  implementation plus rule and constraint inputs are canonical, while generated
  snapshots are reproducible artifacts.
- 2026-05-25: Use `2025-04` as the first baseline and preserve the current SVG id
  interaction contract during migration.
- 2026-05-25: Visual parity means coherent LTA-style output with compatible ids,
  visible network coverage, reasonable label placement, and no major visual
  regression; it does not mean exact coordinate reproduction.
- 2026-05-25: Use `lta-system-map-2011` as the first layout engine id.
- 2026-05-25: Start constraints at station and line-segment scope; avoid
  per-station absolute coordinates except map-frame anchors and explained
  exceptions.
- 2026-05-25: Parse current hard-coded maps into reference fixtures, starting
  with `MapApr2025.tsx`.
- 2026-05-25: Treat LTA-style rules as inferred from reference maps and observed
  conventions because no formal spec is assumed.
- 2026-05-25: Generated snapshots store structured map primitives for the site
  renderer, not TSX.
- 2026-05-25: Model interchange node composition early because overlays depend
  on line-specific station node parts.

## Validation

For site-side changes:

- Run `npm run verify`.
- Add focused renderer/id-contract tests while migrating `StationMap`.
- Use browser screenshots for visual parity on desktop and mobile.
- Manually verify `/system-map` and line profile focused-map cards.
- For map designer changes, verify exported edit bundles recreate the previewed
  schematic data and open reviewed `mrtdown-data` changes.

For data-side changes:

- Run the `mrtdown-data` validation suite.
- Validate archive publication includes schematic map manifests and generated
  versions.
- Verify generated snapshots are reproducible from generator rules and
  constraints.
- Review parsed reference fixtures, semantic diffs, generator diffs, and rendered
  visual diffs for each map version.
