# Overhaul Read Model Plan

## Context

`mrtdown-site` is in the middle of moving data reads from the retired generated
MRTDown API client to a local Postgres/PostGIS-backed read model populated from
canonical mrtdown data archives.

Source-of-truth references:

- `docs/OVERHAUL_BASELINE.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_PIPELINE.md`
- `docs/GENERATED_FILES.md`
- `docs/QUALITY.md`

## Goals

- Keep route and server-function reads backed by the local read model.
- Continue shrinking temporary read-model types in `app/types.ts` toward
  canonical `@mrtdown/core` types or query-local inferred shapes.
- Keep the pull workflow reliable for staging, promotion, batching, deletes, and
  operational facts.
- Preserve generated-file and migration discipline during the stacked overhaul.

## Non-Goals

- This plan does not redesign the public UI.
- This plan does not replace TanStack Start or Cloudflare Workers.
- This plan does not define production performance work; use
  `docs/plans/active/production-performance.md` for that track.

## Phases

### Phase 1: Read Model Migration

- Keep remaining application reads pointed at `app/util/db.queries.ts` and the
  local schema under `app/db`.
- Remove stale generated API client assumptions as they surface.
- Prefer canonical `@mrtdown/core` types where they can replace temporary
  extracted response types cleanly.

Exit criteria:

- No route or server function depends on the retired generated API client.
- Remaining shared read-model types are intentional and documented.

### Phase 2: Pull Workflow Hardening

- Keep canonical archive ingestion in `app/workflows/pull`.
- Maintain staging-to-live promotion behavior for normalized data and facts.
- Add focused tests when changing staging, promotion, batching, or delete logic.

Exit criteria:

- Pull workflow behavior is covered for the main staging and promotion paths.
- Operational fact data remains available to route loaders and statistics.

### Phase 3: Cleanup And Guardrails

- Move durable lessons into `docs/ARCHITECTURE.md`, `docs/DATA_PIPELINE.md`, or
  `docs/QUALITY.md` instead of growing `AGENTS.md`.
- Keep migration changes generated through Drizzle CLI.
- Keep generated route and station map artifacts out of manual edits.

Exit criteria:

- `npm run verify` passes on the branch.
- Documentation entry points reflect the current architecture and active plans.

## Progress Log

- 2026-05-24: Created this active plan to make the stacked overhaul track
  discoverable outside `AGENTS.md`.

## Decision Log

- 2026-05-24: Keep `AGENTS.md` as a short map and move execution context into
  versioned plan files under `docs/plans`.

## Validation

- Run `npm run verify` before handing work back or publishing changes.
- Use narrower checks such as `npm run typecheck`, `npm run lint`,
  `npm run format:check`, and `npm run test:run` while iterating.
