# Quality Harness

Run `npm run verify` before handing off or publishing a change. CI runs the
[same command](../../.github/workflows/validate.yml). Check
[`package.json`](../../package.json) for the current script sequence.

- **Docs.** Run `npm run check:docs` while editing guides or plans. Fix the
  relative link, plan index entry, or [template](../plans/template.md) heading
  named in the error.
- **Migration drift.** If `npm run db:generate:check` reports a schema change,
  run `npm run db:generate` and review the generated SQL and metadata. See
  [generated files](generated-files.md) for the owning tools.
- **Timetable integration tests.** Set `TEST_TIMETABLE_DATABASE_URL` to a
  disposable Postgres database with PostGIS and UTC as its default time zone.
  The tests create and drop their own schemas. A connection URL with an
  `options` parameter can override their schema selection. Local runs without
  the variable skip these tests.
