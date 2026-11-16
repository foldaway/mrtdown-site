# Overhaul Baseline

> Historical note: this file records the starting point and original plan. The
> current application now runs on Fly.io and uses Upstash Workflow/QStash. See
> the [architecture overview](../architecture/overview.md) and
> [data pipeline guide](../architecture/data-pipeline.md) for current behavior.

At the start of the overhaul, `mrtdown-site` was a TanStack Start app deployed
on Cloudflare Workers. The app read most domain data through generated MRTDown
API client types and server functions.

The original overhaul changed that shape to a local Postgres/PostGIS-backed read
model populated from canonical mrtdown data archives. Its first implementation
used Cloudflare Workflow; the current implementation uses Upstash Workflow.

## Migration Checkpoints

- Add DB dependencies and Drizzle schema.
- Add pull workflow and staging tables.
- Replace generated API reads with DB queries.
- Add operational fact tables.
- Add scheduled canonical data pulls (originally through Cloudflare cron;
  currently through QStash schedules).
- Harden workflow batching and deletes.
