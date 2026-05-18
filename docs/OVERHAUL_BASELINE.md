# Overhaul Baseline

At the start of the overhaul, `mrtdown-site` is a TanStack Start app deployed on Cloudflare Workers. The app reads most domain data through generated MRTDown API client types and server functions.

The overhaul changes that shape to a local Postgres/PostGIS-backed read model populated from canonical mrtdown data archives by a Cloudflare Workflow.

This file is a baseline for reviewers and agents. It is not the long-term architecture reference. As the stacked overhaul branches land, prefer `docs/ARCHITECTURE.md` and `docs/DATA_PIPELINE.md`.

## Migration Checkpoints

- Add DB dependencies and Drizzle schema.
- Add pull workflow and staging tables.
- Replace generated API reads with DB queries.
- Add operational fact tables.
- Add scheduled Cloudflare pulls.
- Harden workflow batching and deletes.
