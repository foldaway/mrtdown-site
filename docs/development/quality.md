# Quality Harness

Run `npm run verify` before handing off or publishing a change. CI runs the
[same command](../../.github/workflows/validate.yml). Check
[`package.json`](../../package.json) for the current script sequence.

- **Docs.** Run `npm run check:docs` while editing guides or plans. Fix the
  relative link or heading anchor, plan index entry, or [template](../plans/template.md) section
  named in the error.
- **Migration drift.** If `npm run db:generate:check` reports a schema change,
  run `npm run db:generate` and review the generated SQL and metadata. See
  [generated files](generated-files.md) for the owning tools.
- **Timetable integration tests.** Set `TEST_TIMETABLE_DATABASE_URL` to a
  disposable Postgres database with PostGIS and UTC as its default time zone.
  The tests create and drop their own schemas. A connection URL with an
  `options` parameter can override their schema selection. Local runs without
  the variable skip these tests.
- **Published snapshots.** Set `TEST_SNAPSHOT_REDIS_URL` to a disposable
  local Redis/Valkey instance. Tests use an isolated key prefix and remove only
  their own keys. CI supplies both Redis and PostGIS; the range parity tests
  verify that snapshot hits succeed with SQL access disabled. Arrival metadata
  checks combine the same Redis service with an isolated PostGIS schema and
  compare cached selection decisions with the existing SQL reader.

## Disposable services for an isolated worktree

Keep shared Compose services running. Start task-specific containers on random
localhost ports, using the same PostGIS/Valkey images as CI:

```sh
docker run --detach --name site-check-postgis -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mrtdown_test -e TZ=UTC -p 127.0.0.1::5432 ghcr.io/baosystems/postgis:17
docker run --detach --name site-check-valkey -p 127.0.0.1::6379 valkey/valkey:9-alpine
docker port site-check-postgis 5432
docker port site-check-valkey 6379
```

Use unique names if those names already exist. Wait for Postgres readiness with
`docker exec site-check-postgis pg_isready -U postgres -d mrtdown_test`, then
substitute the printed ports below:

```sh
TEST_TIMETABLE_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:POSTGRES_PORT/mrtdown_test TEST_SNAPSHOT_REDIS_URL=redis://127.0.0.1:REDIS_PORT TZ=UTC npm run verify
```

Expect all integration cases to run, without skipped tests. The tests own schema
and key cleanup; do not put shared or production URLs in these variables. When
finished, remove only the containers created for this check:

```sh
docker rm --force --volumes site-check-postgis site-check-valkey
```

If verification fails, keep the output and distinguish a service/setup failure
from a regression. Do not reset another worktree's database or stop its services.
