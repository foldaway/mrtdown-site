# Quality Harness

Use `npm run verify` as the default branch check.

The default verification script currently runs:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run db:generate:check`
- `npm run test:run`

`npm run format:check` uses Biome's non-writing check mode across the repository. This keeps local verification aligned with CI and catches uncommitted formatting issues before a branch is pushed.

Generated files listed in `docs/GENERATED_FILES.md` are excluded from normal Biome checks in `biome.json`.

`npm run verify:strict` currently mirrors the default verification script so existing references continue to work during the overhaul.

`npm run db:generate:check` runs Drizzle Kit against a temporary copy of the migration folder and fails when schema changes would generate a new migration. If it fails, run `npm run db:generate` and commit the generated files.

Generated files are excluded from normal Biome checks. If a generated file changes, review the generation source and the produced diff rather than making hand edits.

## Current Gaps

The overhaul still needs broader tests around DB query behavior, pull workflow staging and promotion, operational facts, i18n route handling, and smoke coverage for the main public pages.

The known cleanup work is to broaden coverage around the overhaul paths and decide which generated/config files Biome should own.
