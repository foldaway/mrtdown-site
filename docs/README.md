# Documentation

See the [project README](../README.md) for setup and the
[agent map](../AGENTS.md) for repository working rules.

## Architecture and data

- [Application architecture](architecture/overview.md) covers the TanStack
  Start application, PostGIS read model, and deployment environments.
- [Data pipeline](architecture/data-pipeline.md) covers canonical imports,
  timetable retention, and the departure projection.

## Operations and API

- [Cloudflare edge caching](operations/edge-caching.md) covers cache eligibility,
  invalidation, deployment configuration, and production checks.
- [Station arrivals API v2](api/station-arrivals-v2.md) documents request
  parameters, coverage, and rider reports.

## Development

- [Writing docs and proposals](development/writing.md) covers what to write
  down and when to link to the source.
- [Quality harness](development/quality.md) explains local verification.
- [Generated files](development/generated-files.md) lists regeneration commands
  and the files they own.

## Plans and evidence

- [Execution plans](plans/README.md) explains when to write a plan and indexes
  active work and completed plans.
- [Site slowness investigation](investigations/2026-05-21-site-slowness.md)
  records the initial route performance and payload findings.
- [Station-arrival topology reuse](investigations/2026-11-18-station-arrival-topology.md)
  recommends snapshot-safe reuse and focused implementation/measurement checks.
- [System map feasibility](investigations/2026-05-24-system-map-generation-feasibility.md)
  compares schematic map generation approaches.
- [Markdown for agents feasibility](investigations/2026-05-29-markdown-for-agents-feasibility.md)
  records the evaluation of Markdown delivery options.
- [Range reference egress](investigations/2026-11-18-range-reference-egress.md)
  records range-reference narrowing, generation-based caching, and validation.
- [Overhaul baseline](history/overhaul-baseline.md) records the original
  migration from API-client reads to the local read model.
