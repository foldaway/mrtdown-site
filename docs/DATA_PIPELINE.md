# Data Pipeline

The overhaul introduces a local read model for canonical mrtdown data.

## Pull Workflow

`app/workflows/pull/index.ts` defines the Upstash Workflow entrypoint. It:

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
windows use weekend timings on public holidays. QStash has a separate weekly
schedule for this workflow; use
`/internal/api/tasks/public-holidays` for an immediate manual refresh after an
out-of-cycle update.

## Scheduled Jobs

The preview, staging, and production deployment workflows run
`npm run qstash:schedules:sync` after a successful Fly deployment. The command
idempotently creates or updates the QStash schedules for the canonical pull,
public holiday sync, and crowd report dispatch. Schedule IDs include `TIER`, so
the environments can share one QStash account without overwriting each other.

Configure `QSTASH_URL`, `QSTASH_TOKEN`, and `INTERNAL_API_TOKEN` as secrets in
each GitHub deployment environment. The deployment workflow supplies `TIER`
and `VITE_ROOT_URL`; `INTERNAL_API_TOKEN` must match one of the target app's
`INTERNAL_API_TOKENS`. To inspect the configuration locally without calling
QStash, set those five variables and run:

```sh
npm run qstash:schedules:sync -- --dry-run
```

The sync only manages its three deterministic schedule IDs; it does not delete
other QStash schedules. Cron expressions use UTC, matching the former
Cloudflare schedules.

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

The six-hourly QStash schedule also invokes the same dispatch path when
`CROWD_REPORT_DISPATCH_GITHUB_TOKEN` is configured. Use
`CROWD_REPORT_DISPATCH_LIMIT` to tune the maximum number of dispatch candidates
processed per scheduled run.

## Staging Tables

Staging tables are named with a `_next` suffix. They are the durable handoff between workflow steps and avoid returning large parsed payloads between Upstash Workflow steps.

## Live Reads

Server functions call `app/util/db.queries.ts`, which reads normalized live tables and returns the source-owned shapes in `app/types.ts`.
