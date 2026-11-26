# Documentation

Start with the task below. Guides describe maintained behavior; plans track work;
completed records and investigations describe what was checked at a named time.
See [repository working rules](../AGENTS.md) before contributing.

## Run, operate, or integrate

| Task | Start here |
| --- | --- |
| Set up a local app | [README](../README.md) |
| Trace a request or choose a code boundary | [Architecture](architecture/overview.md) |
| Import data, rotate a timetable, or inspect scheduled work | [Data pipeline](architecture/data-pipeline.md), [timetable operation](operations/timetable-imports.md) |
| Configure or repair published inputs and edge caching | [Cache runbook](operations/edge-caching.md) |
| Call the arrivals endpoint | [Station arrivals v2](api/station-arrivals-v2.md) |
| Submit machine-produced reports | [Producer contract](architecture/data-pipeline.md#programmatic-crowd-reports) |

## Change the repository

- [Quality checks](development/quality.md): verification and disposable services.
- [Generated files](development/generated-files.md): owning regeneration tools.
- [Writing and maintaining docs](development/writing.md): when to write, where
  content belongs, and how to keep docs and PRs concise.
- [Execution plans](plans/README.md): remaining outcomes, completed work, and
  [optional follow-ups](plans/tech-debt.md).

## Consult dated evidence

These records inform decisions; recheck their assumptions against current source
and deployment before acting.

- [Site slowness, May 21](investigations/2026-05-21-site-slowness.md): original
  Worker-era route latency and payload measurements.
- [Map feasibility, May 24](investigations/2026-05-24-system-map-generation-feasibility.md)
  and [Markdown feasibility, May 29](investigations/2026-05-29-markdown-for-agents-feasibility.md):
  alternatives considered before implementation.
- [Arrival topology, November 18](investigations/2026-11-18-station-arrival-topology.md)
  and [range egress, November 18](investigations/2026-11-18-range-reference-egress.md):
  snapshot consistency and SQL transfer findings.
- [Completed plan index](plans/README.md#completed): implementation and rollout
  receipts, with local verification distinguished from production evidence.
- [Overhaul baseline](history/overhaul-baseline.md): original API-client migration.
