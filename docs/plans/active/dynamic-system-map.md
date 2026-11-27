# Import and render reviewed schematic maps

Maintain this living plan using the [planning standard](../README.md#standard-layout).

## Purpose

Render canonical generated schematic maps with the existing station links,
localized labels, overlays, zoom and timeline behavior. Start with reviewed
`2025-04` output, then migrate the current timeline without removing the TSX
fallback before parity is established.

## Progress

- [x] (2026-05-24–25) Decide generator/data ownership and baseline parity rules.
- [x] (2026-11-26 review) Confirm generator/schema/export tooling in the data
  reference and hard-coded snapshots in the current site.
- [ ] Review baseline coverage and prove archive import plus renderer behavior.
- [ ] Migrate every required timeline version with structural and visual review.

## Surprises & Discoveries

The old site plan proposed generator tooling that already exists in the data
repo. Its reference inventory distinguishes operational topology from additional
displayed stations/connectors, so open service-edge coverage alone cannot prove
visual parity. The site now includes `2026-07`; `2025-04` remains a comparison
baseline, not the only current snapshot.

## Decision Log

- 2026-05-24–25 — Data owns generator rules, reviewed constraints and complete
  effective-date snapshots; the site owns SVG rendering and interactions.
  Use engine `lta-system-map-2011`, initially station/segment constraints, with
  fixed frame anchors or explained exceptions rather than copied coordinates.
- 2026-05-25 — Parity means compatible semantic IDs, visible network coverage,
  coherent geometry/labels and line-specific interchange parts, not exact pixels.
  LTA-style rules are inferred; no formal design specification is assumed.
- 2026-11-26, documentation review — Align with data PR #509: snapshots are
  generated publication artifacts, superseding the original committed-output
  proposal. Use existing structured primitives; expand raw paths only for a
  demonstrated reviewed exception. Defer the optional designer to tech debt.

## Outcomes & Retrospective

No site archive import or generated renderer is implemented by this plan yet.
The data tooling is implementation evidence, not baseline visual acceptance or
site deployment. The [original site plan](https://github.com/foldaway/mrtdown-site/blob/fdf2a7b8effd7916f85c7e990b8b50ed7540fc96/docs/plans/active/dynamic-system-map.md)
retains early decisions and superseded generator phases.

## Context and Orientation

[StationMap](../../../app/components/StationMap/index.tsx) selects TSX snapshots
and uses SVG IDs to find line groups, segments, labels and station parts. The
data reference's [paired plan](https://github.com/foldaway/mrtdown-data/blob/6db1a722c26acbb283d42d6d9fbef642c9ba521d/docs/plans/active/schematic-system-map.md)
records existing schemas, generator, CLI and staged Pages export.
Canonical inputs are code/rules/constraints; published snapshots contain generated
coordinates. Keep these distinct from reusable anchors and explained exceptions.
The site's normal pull does not yet establish a schematic-map consumer boundary.

## Plan of Work

First compare fixed-time `2025-04` generation with `MapApr2025.tsx` and the
data reference inventory. Resolve intended displayed-versus-operational coverage,
IDs, labels, layers and exceptions with a reviewer before changing runtime output.

Then prove import of the exact local archive through the pull/read-model boundary
and build one structured SVG renderer. Preserve effective-date selection and
line-specific interchange fading; resolve schema/version errors without breaking
existing maps. Record archive and consumer revisions together.

Migrate each current timeline version after desktop/mobile review. Recheck the
actual site timeline, including July 2026, before defining the migration set.
Retire TSX imports and update generated-file guidance only when every required
version passes. Keep the public system map's eager content and profile widgets'
deferred loading behavior unless a separately measured decision changes it.

## Concrete Steps

From the site root with dependencies installed:

```sh
npm run verify
npm run build
```

Expect passing checks and client/server build output. In a separate data checkout,
use the paired plan's fixed-timestamp generation, preview and Pages-build commands;
these create local artifacts. Site import/renderer commands are not yet available:
add exact invocations here with that implementation, before consumer acceptance.
Record the archive digest and review desktop/mobile `/system-map` and focused-line
widgets on an isolated app. These steps do not authorize publication.

## Validation and Acceptance

One exact generated archive imports and renders with valid unique IDs, intended
station/service-edge coverage, usable localized labels, line parts, overlays,
station links and zoom. Record structural and visual review independently.
Fixed-input generation must be repeatable with a fixed `generatedAt`; unpinned
timestamps are not a byte-parity test. All current timeline versions must meet
these checks before fallback removal. A build alone is insufficient.

## Idempotence and Recovery

Keep old snapshots selectable throughout the experiment. Reject incompatible
schema or failed imports without replacing working map output. Regenerate from
reviewed rules/constraints after a bad baseline; do not hand-patch artifacts.
Migrate one version per review and revert its selection if necessary. Add exact
read-model retry/cleanup steps when the importer is designed.

## Artifacts and Notes

The [feasibility study](../../investigations/2026-05-24-system-map-generation-feasibility.md)
and paired data plan are obtained design evidence. Still needed: coverage findings,
reviewed exceptions, archive digest, consumer commit, structural checks, screenshots
and per-version sign-off. No rendering or deployment acceptance is asserted.

## Interfaces and Dependencies

Use the data repo's `packages/core/src/schema/SchematicMap.ts`, generator and
published manifest/version contract after checking compatibility with the site's
pinned `@mrtdown/core`. Preserve SVG semantic IDs until a reviewed adapter replaces
them. Site owns loading/caching, localized labels and interactions; data owns
canonical references, generation and reviewed submissions. The optional designer
must submit normal reviewed data PRs, never direct canonical writes.
