# Overhaul Read Model Plan

> Historical note: this completed plan predates the move from Cloudflare
> Workers to Fly.io and Upstash Workflow. See `docs/ARCHITECTURE.md` and
> `docs/DATA_PIPELINE.md` for the current platform architecture.

## Context

`mrtdown-site` moved data reads from the retired generated MRTDown API client to
a local Postgres/PostGIS-backed read model populated from canonical mrtdown data
archives.

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

Status: complete. `docs/ARCHITECTURE.md` documents the retired generated API
client boundary and `app/types.ts` as the temporary source-owned read-model
boundary. A source scan on completion found no route or server-function
dependencies on the retired generated client.

### Phase 2: Pull Workflow Hardening

- Keep canonical archive ingestion in `app/workflows/pull`.
- Maintain staging-to-live promotion behavior for normalized data and facts.
- Add focused tests when changing staging, promotion, batching, or delete logic.

Exit criteria:

- Pull workflow behavior is covered for the main staging and promotion paths.
- Operational fact data remains available to route loaders and statistics.

Status: complete. `app/workflows/pull/helpers/stagingSync.test.ts` covers main
staging row mapping and batching. `app/workflows/pull/index.test.ts` guards the
promotion/orphan/finalize/facts rebuild order. The workflow rebuilds operational
facts after finalizing a successful pull.

### Phase 3: Cleanup And Guardrails

- Move durable lessons into `docs/ARCHITECTURE.md`, `docs/DATA_PIPELINE.md`, or
  `docs/QUALITY.md` instead of growing `AGENTS.md`.
- Keep migration changes generated through Drizzle CLI.
- Keep generated route and station map artifacts out of manual edits.

Exit criteria:

- `npm run verify` passes on the branch.
- Documentation entry points reflect the current architecture and active plans.

Status: complete. Durable notes live in architecture, data pipeline, quality,
and generated-file docs. This plan is retained under `docs/plans/completed`.

## Progress Log

- 2026-05-24: Created this active plan to make the stacked overhaul track
  discoverable outside `AGENTS.md`.
- 2026-05-27: Confirmed the retired-client boundary, added pull workflow
  guardrail tests, updated quality docs, and moved the plan to completed.

## Decision Log

- 2026-05-24: Keep `AGENTS.md` as a short map and move execution context into
  versioned plan files under `docs/plans`.
- 2026-05-27: Close the read-model overhaul as a completed migration while
  leaving broader performance and crowdsourced-report tracks in their active
  plans.

## Validation

- Run `npm run verify` before handing work back or publishing changes.
- Use narrower checks such as `npm run typecheck`, `npm run lint`,
  `npm run format:check`, and `npm run test:run` while iterating.
