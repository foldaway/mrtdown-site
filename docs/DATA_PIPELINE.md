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
Canonical pulls run daily at 00:00 UTC in every environment.

Configure `QSTASH_URL`, `QSTASH_TOKEN`, and `INTERNAL_API_TOKEN` as secrets in
each GitHub deployment environment. The deployment workflow supplies `TIER`
and `VITE_ROOT_URL`; `INTERNAL_API_TOKEN` must match one of the target app's
`INTERNAL_API_TOKENS`. Configure `QSTASH_CURRENT_SIGNING_KEY` and
`QSTASH_NEXT_SIGNING_KEY` on each Fly app; workflow endpoints reject requests
when either key is missing outside local `QSTASH_DEV` mode. To inspect the
configuration locally without calling QStash, set the schedule variables and
run:

```sh
npm run qstash:schedules:sync -- --dry-run
```

The sync only manages its three deterministic schedule IDs; it does not delete
other QStash schedules. Cron expressions use UTC, matching the former
Cloudflare schedules.

## Operational Facts

Daily fact rebuilds write aggregate service, downtime, and issue counts to
`line_day_facts`. They also write each issue interval clipped to the applicable
line service window to `line_day_issue_intervals`. The interval rows are derived,
rebuildable data used when a read needs exact placement or overlapping impact
lanes rather than aggregate durations alone. The same rebuild refreshes
`station_issue_facts`, an exact issue-to-station projection used for compact
station status and latest-disruption reads without reconstructing impact-event
history on a public request.

## Crowd Report Dispatch

Accepted crowdsourced reports and accepted report clusters trigger a
best-effort dispatch attempt as soon as the submission transaction commits. The
submission response does not wait for GitHub, and accepted rows stay pending if
that attempt cannot complete. The `/internal/api/tasks/crowd-report-dispatch`
endpoint builds an
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

The daily 18:00 UTC QStash schedule invokes the same dispatch path as a retry
backstop when `CROWD_REPORT_DISPATCH_GITHUB_TOKEN` is configured. This gives
the upstream ingest workflow six hours before the daily canonical pull. Use
`CROWD_REPORT_DISPATCH_LIMIT` to tune the maximum number of dispatch candidates
processed per scheduled run.

### Programmatic crowd reports

Registered machine producers submit structured reports to
`POST /internal/api/crowd-reports` with their own bearer credential. Configure
the credentials and permitted upstream origins as a JSON map in
`CROWD_REPORT_PRODUCERS`:

```json
{
  "reddit-monitor": {
    "token": "replace-with-a-long-random-secret",
    "sourceOrigins": ["https://www.reddit.com"]
  }
}
```

The request wraps the public structured-report fields with a producer-owned
idempotency key and optional upstream URL:

```json
{
  "externalReportId": "opaque-source-object-id",
  "sourceUrl": "https://www.reddit.com/r/singapore/comments/example",
  "report": {
    "reportScope": "line",
    "observedAt": "2026-07-18T08:00:00+08:00",
    "lineIds": ["CCL"],
    "stationIds": [],
    "effect": "delay",
    "delayMinutes": 10,
    "isStillHappening": true
  }
}
```

A new report and an identical replay both return `202`; the response sets
`idempotentReplay` to distinguish them. Reusing an external ID with a different
payload returns `409`. Programmatic reports bypass public Turnstile, IP rate
limits, and distinct-IP confidence requirements, but retain the same reference
validation, moderation, clustering, cache purge, and canonical dispatch path.

## Staging Tables

Staging tables are named with a `_next` suffix. They are the durable handoff between workflow steps and avoid returning large parsed payloads between Upstash Workflow steps.

## Live Reads

Server functions call feature modules under `app/util/dbQueries`, which read
normalized live tables through the shared dataset layer and return the
source-owned shapes in `app/types.ts`.
