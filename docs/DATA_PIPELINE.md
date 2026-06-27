# Data Pipeline

The app stores its local canonical read model and site-local writable state in
Cloudflare D1.

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

## Crowd Report Dispatch

Accepted crowdsourced reports and accepted report clusters stay site-local until
the scheduled dispatch job or an operator invokes the dispatch path. The
`/internal/api/tasks/crowd-report-dispatch` endpoint builds an
`@mrtdown/ingest-contracts` `crowd-report` payload, posts it to the
`mrtdown-data` `repository_dispatch` ingest workflow, and records dispatch
success or failure on the site-local report rows.

Configure `CROWD_REPORT_DISPATCH_GITHUB_TOKEN` as a deployed secret. Optional
overrides are `CROWD_REPORT_DISPATCH_GITHUB_OWNER`,
`CROWD_REPORT_DISPATCH_GITHUB_REPO`, and
`CROWD_REPORT_DISPATCH_GITHUB_EVENT_TYPE`. The canonical evidence source URL is
built from `VITE_ROOT_URL` as a stable `/community-reports/{kind}/{id}`
permalink. Send `{ "dryRun": true }` to the endpoint to inspect pending payloads
without calling GitHub or mutating report state.

The existing six-hourly scheduled cron also invokes the same dispatch path when
`CROWD_REPORT_DISPATCH_GITHUB_TOKEN` is configured. Use
`CROWD_REPORT_DISPATCH_LIMIT` to tune the maximum number of dispatch candidates
processed per scheduled run.

## Staging Tables

Staging tables are named with a `_next` suffix. They are the durable handoff between workflow steps and avoid returning large parsed payloads between Cloudflare Workflow steps.

## Live Reads

Server functions call `app/util/db.queries.ts`, which reads normalized live
tables from D1 and returns the source-owned shapes in `app/types.ts`.
