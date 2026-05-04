# Agent Notes

This repository is mid-overhaul on the stacked `codex/overhaul-*` branches.

## Entry Points

- App routes live in `app/routes`.
- Server functions live in `app/util/*.functions.ts`.
- Database schema and connection helpers live in `app/db`.
- Canonical data pull workflow code lives in `app/workflows/pull`.
- Generated files include `app/client/**`, `app/routeTree.gen.ts`, and large station map snapshots under `app/components/StationMap/components/Map*.tsx`.

## Verification

Run `npm run verify` before publishing changes. The command runs the currently green baseline check for this point in the overhaul stack.

Use narrower commands while iterating:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test:run`
- `npm run verify:strict`

## Generated Files

Do not manually edit generated files unless the task is explicitly about generated output. Prefer regenerating them with the relevant script or tool, then review the generated diff.

## Overhaul Context

The overhaul moves data reads from the generated MRTDown API client toward a local Postgres/PostGIS-backed read model populated from canonical mrtdown data archives. See `docs/OVERHAUL_BASELINE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_PIPELINE.md`, and `docs/GENERATED_FILES.md`.
