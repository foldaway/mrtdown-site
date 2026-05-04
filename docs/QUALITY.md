# Quality Harness

Use `npm run verify` as the default branch check.

The baseline verification script currently runs:

- `npm run test:run`

The stricter verification target is available as `npm run verify:strict` and runs:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test:run`

Generated files are excluded from normal Biome checks. If a generated file changes, review the generation source and the produced diff rather than making hand edits.

## Current Gaps

The overhaul still needs broader tests around DB query behavior, pull workflow staging and promotion, operational facts, i18n route handling, and smoke coverage for the main public pages.

`npm run verify:strict` is not yet clean at this point in the stack. The known cleanup work is to fix TypeScript errors, decide which generated/config files Biome should own, and then promote strict verification into the default CI path.
