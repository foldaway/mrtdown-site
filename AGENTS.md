# Agent Map

Start at the [documentation index](docs/README.md). Keep durable guidance in
the relevant subject guide and use this file to point to it.

## Entry points

- [Local setup and commands](README.md)
- [Architecture](docs/architecture/overview.md) for routes in `app/routes`,
  server functions in `app/util/*.functions.ts`, and the PostGIS read model
  in `app/db` and `app/util/dbQueries`. Prefer canonical `@mrtdown/core`
  domain types where possible.
- [Data pipeline](docs/architecture/data-pipeline.md) for canonical archive
  imports and timetable retention in `app/workflows/pull`.
- [Quality checks](docs/development/quality.md) and
  [generated files](docs/development/generated-files.md).
- [Execution plans](docs/plans/README.md) for choosing a checklist or a
  versioned plan, finding existing work, and recording a handoff.

## Working rules

- Keep modules focused. Declare an explicit TypeScript props type for React
  components and use it in the function signature.
- Regenerate generated files with their owning tools. Use `npm run db:generate`
  for schema migrations so Drizzle maintains the SQL, snapshots, and journal.
- Run `npm run verify` before handing back or publishing changes.
  Report any blocked or failing check, including the command and remaining risk.
- Use Conventional Commits for commit subjects and PR titles. Add this trailer
  after a blank line in Codex-created commits:

  ```text
  Co-authored-by: Codex <codex@openai.com>
  ```
