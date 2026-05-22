# Data Pipeline

The overhaul introduces a local read model for canonical mrtdown data.

## Pull Workflow

`app/workflows/pull/index.ts` defines the Cloudflare Workflow entrypoint. It:

- fetches the manifest and archive from `MRTDOWN_DATA_URL`;
- parses archive contents with `ZipStore` and `@mrtdown/fs`;
- inserts parsed entities into `*_next` staging tables;
- promotes changed rows into live tables;
- deletes orphans after dependents are synchronized;
- finalizes metadata for the completed pull.

## Public Holiday Workflow

`app/workflows/publicHolidays/index.ts` syncs Singapore public holidays from the
data.gov.sg consolidated public holidays dataset into `public_holidays`.
Holiday changes rebuild operational facts for affected dates so line service
windows use weekend timings on public holidays. The worker has a separate
weekly cron trigger for this workflow; use
`/internal/api/tasks/public-holidays` for an immediate manual refresh after an
out-of-cycle update.

## Staging Tables

Staging tables are named with a `_next` suffix. They are the durable handoff between workflow steps and avoid returning large parsed payloads between Cloudflare Workflow steps.

## Live Reads

Server functions call `app/util/db.queries.ts`, which reads normalized live tables and returns the source-owned shapes in `app/types.ts`.
