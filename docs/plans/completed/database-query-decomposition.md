# Database Query Decomposition

## Context

`app/util/db.queries.ts` has grown to more than 5,400 lines and combines raw
Drizzle reads, read-model assembly, interval and operating-hours calculations,
analytics, maintenance writes, and page response shaping. Its central
`buildDataset` function also assembles most of the network and issue graph for
nearly every public query.

The module needs structural boundaries before its over-fetching and response
costs can be improved safely. This plan keeps the initial work behavior
preserving so performance changes can be reviewed separately.

## Goals

- Separate database access and dataset assembly from pure domain calculations.
- Give operational facts and statistics snapshot maintenance explicit modules.
- Group page-shaped queries by the feature that owns their response.
- Preserve current exports and response shapes throughout the migration.
- Split the monolithic unit test file along the same ownership boundaries.

## Non-Goals

- Change database schemas or migrations.
- Optimize dataset loading or introduce feature-specific SQL in this change.
- Change public response shapes, cache behavior, or server timing names.
- Replace temporary `app/types.ts` types beyond moves required by the split.

## Phases

### Phase 1: Shared domain seams

- Extract database helpers, Singapore time handling, issue intervals, service
  operations, issue event state, and common issue analytics.
- Keep existing exports available through `app/util/db.queries.ts`.

Exit criteria:

- Pure helpers have no feature-query dependencies.
- Existing helper tests pass from their new owning modules.

### Phase 2: Read-model dataset

- Move dataset loading and assembly behind `app/util/dbQueries/dataset.ts`.
- Separate included-entity response selection and issue-range loading.

Exit criteria:

- Dataset code depends only on schema, low-level utilities, and canonical
  read-model helpers.
- Feature and maintenance modules can consume the dataset without importing the
  compatibility barrel.

### Phase 3: Analytics and maintenance

- Extract advisory summaries, line analytics, operational fact rebuilds, and
  statistics snapshot handling.

Exit criteria:

- Workflow callers import maintenance entry points from their owning modules.
- Statistics and fact validation passes without response changes.

### Phase 4: Feature queries

- Move root, overview/system-map, line, issue, station, town, operator, history,
  and sitemap query functions into feature modules.
- Update server functions and inferred type consumers to direct imports.

Exit criteria:

- `app/util/db.queries.ts` is only a temporary compatibility export surface or
  can be removed when no callers remain.
- Tests are organized by module ownership.

### Phase 5: Validation and closeout

- Run the full repository verification command.
- Review imports and the final dependency direction for cycles.
- Move this plan to `docs/plans/completed` after all exit criteria pass.

Exit criteria:

- `npm run verify` passes.
- No runtime consumer imports the old monolithic implementation.

## Progress Log

- 2026-07-18: Mapped the 5,410-line module, identified `buildDataset` as the
  central coupling point, and started the behavior-preserving decomposition.
- 2026-07-18: Extracted the implementation into focused modules, moved every
  runtime consumer to direct ownership imports, split the tests into nine
  focused suites, removed the compatibility barrel, and verified the complete
  repository.

## Decision Log

- 2026-07-18: Use `app/util/dbQueries` for the new modules so `app/db` remains
  focused on schema and connection infrastructure.
- 2026-07-18: Preserve a compatibility barrel during code motion and require
  direct imports between new internal modules to prevent cycles.
- 2026-07-18: Defer feature-specific query optimization until after structural
  boundaries are verified.
- 2026-07-18: Removed the compatibility barrel after all application and test
  consumers moved to direct module imports; a dependency audit found no cycles.

## Validation

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test:run`
- `npm run verify`

Completed on 2026-07-18. `npm run verify` passed with 50 test files and 291
tests.
