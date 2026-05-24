# Agent Notes

This repository is mid-overhaul on the stacked `codex/overhaul-*` branches.

## Entry Points

- App routes live in `app/routes`.
- Server functions live in `app/util/*.functions.ts`.
- Database schema and connection helpers live in `app/db`.
- Canonical data pull workflow code lives in `app/workflows/pull`.
- Generated files include `app/routeTree.gen.ts` and large station map snapshots under `app/components/StationMap/components/Map*.tsx`.

## Verification

Run `npm run verify` before handing work back or publishing changes. The command runs typechecking, linting, formatting checks, migration drift checks, and tests.

Agents must treat validation as part of the task, not as an optional follow-up. If validation cannot be run, or if any validation step fails, document the exact command, failure, and remaining risk in the final response and do not claim the work is ready.

Use narrower commands while iterating:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test:run`
- `npm run verify:strict`

## Pull Requests

PR titles must follow Conventional Commits, for example `chore: retire generated API client types`. Keep the title aligned with the commit scope so release tooling and changelog readers can classify the change without opening the PR.

## Generated Files

Do not manually edit generated files unless the task is explicitly about generated output. Prefer regenerating them with the relevant script or tool, then review the generated diff.

## Database Migrations

Create database migrations through the Drizzle CLI (`npm run db:generate` or `drizzle-kit generate`) so `drizzle/meta/_journal.json`, snapshot files, and migration timestamps stay consistent. Do not hand-create numbered migration files or manually edit the Drizzle journal unless repairing existing migration metadata.

## Overhaul Context

The overhaul moves data reads from the generated MRTDown API client toward a local Postgres/PostGIS-backed read model populated from canonical mrtdown data archives. The generated API client has been retired, and the remaining extracted read-model type surface should continue shrinking toward canonical `@mrtdown/core` types. See `docs/OVERHAUL_BASELINE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_PIPELINE.md`, and `docs/GENERATED_FILES.md`.

## Current Plans

Use checked-in plans for multi-phase work that needs durable context across agent runs. Active plans live in `docs/plans/active`, completed plans live in `docs/plans/completed`, and plan conventions live in `docs/plans/README.md`.

Current active plans:

- `docs/plans/active/crowdsourced-reports.md`
- `docs/plans/active/overhaul-read-model.md`
- `docs/plans/active/production-performance.md`
