# System Map Generation Feasibility (2026-05-24)

## Question

Can the system map diagram be generated from structured data at build/runtime instead of shipping hard-coded SVG snapshots as TSX components?

## Current State (Observed)

- The system map uses **snapshot components** (`MapJan2012`, `MapNov2017`, … `MapDec2032`) selected by date logic in `StationMap/index.tsx`.
- Snapshot files are very large (`~93,593` total lines across `Map*.tsx`), and they are documented as mechanically converted generated artifacts.
- Interactive behavior in `StationMap` depends on strict SVG id conventions:
  - segment ids like `line_<stationA>:<stationB>`
  - node ids like `node_<stationId>`
  - label ids like `label_<stationId>`
  - line group ids like `line_<lineId>`

This means any generation approach must preserve these identifiers (or migrate all DOM-query logic).

## Feasibility Assessment

## 1) Pure runtime generation from canonical graph data

**Feasibility: Low–Medium (for current visual fidelity).**

- Rendering line/station topology from DB/canonical data is straightforward.
- However, current maps encode substantial handcrafted geometry (control points, bezier curves, label offsets, interchange composition, branch bends, station stack spacing).
- Canonical transit graph data usually has connectivity, not cartographic layout geometry. Auto-layout would likely produce a valid graph but a visually different map, especially for historical snapshots.

**Conclusion:** Runtime generation is possible for a *new schematic style*, but not a drop-in replacement for current snapshots without introducing/layout-curation data.

## 2) Build-time generation from authored layout data

**Feasibility: High (recommended).**

- Keep historical-map fidelity by introducing versioned layout source data (JSON/YAML/TS) that stores coordinates/paths/label positions.
- Generate SVG (or TSX) in CI/build via a deterministic script.
- Preserve existing id contracts so `StationMap/index.tsx` highlight/focus logic keeps working.

**Conclusion:** Most practical migration path with lowest product risk.

## 3) Keep hard-coded snapshots, but optimize delivery

**Feasibility: Very high (short-term performance-only).**

- Route splitting already exists as a concern in performance planning docs.
- This reduces startup costs but does not solve maintainability/authoring friction.

**Conclusion:** Good interim step, not a long-term authoring solution.

## Recommended Target Architecture

Adopt **build-time generated snapshots** from a versioned layout schema.

### Proposed schema primitives per map version

- `stations[]`: `{ id, x, y, labelX, labelY, interchangeParts[] }`
- `segments[]`: `{ id, lineId, fromStationId, toStationId, pathD, styleVariant }`
- `lines[]`: `{ id, color, width, cap, join }`
- `labels[]`: `{ stationId, textAnchor, dx, dy, rotation }`
- `meta`: `{ effectiveDate, viewport, background, legendBlocks }`

### Generator responsibilities

- Validate referential integrity (`segment.stationIds` exist, line ids known).
- Emit stable ids exactly matching current DOM querying conventions.
- Emit deterministic output order to keep diffs reviewable.
- Optionally emit minified `.svg` assets + lightweight wrapper component.

## Migration Plan

1. **Codify id contract** currently relied on by `StationMap/index.tsx` into tests.
2. Extract one map snapshot (e.g., `MapNov2024`) into machine-readable layout JSON.
3. Build generator that round-trips JSON → TSX/SVG and diffs close to existing output.
4. Swap one snapshot to generated output while keeping runtime behavior unchanged.
5. Migrate remaining snapshots incrementally.
6. Add CI guard: generated maps must be up-to-date (like route tree/migrations checks).

## Key Risks

- **Geometry drift:** generated output differs subtly from current visual baseline.
- **Identifier drift:** breaks outage highlighting/focused-line fading logic.
- **Historical correctness burden:** each snapshot date needs curated layout deltas.
- **Review noise:** without deterministic sorting/formatting, generated diffs can be large and noisy.

## Effort Estimate (rough)

- Spike (1 map version + generator + contract tests): **2–4 engineer-days**.
- Full migration (9 snapshots + docs/tooling + CI): **2–4 engineer-weeks** depending on desired fidelity and validation rigor.

## Bottom Line

Generating the system map is feasible, but the practical path is **build-time generation from curated layout data**, not naive runtime auto-layout from topology alone. This keeps the current visual product quality while replacing hard-coded TSX with maintainable, reproducible generated artifacts.
