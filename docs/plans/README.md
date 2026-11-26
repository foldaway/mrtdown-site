# Execution plans

Use a PR description or in-session checklist for bounded work. Write a versioned
plan when ordered PRs, repositories, migration/recovery gates or unresolved
decisions must survive a handoff. Update an existing plan for the same outcome.
The [writing guide](../development/writing.md) owns documentation placement and style.

## Standard layout

Copy the [template](template.md) to `active/<topic>.md` and link it below. Keep
these level-two headings in order; use lower headings for task-specific detail:

1. Purpose
2. Progress
3. Surprises & Discoveries
4. Decision Log
5. Outcomes & Retrospective
6. Context and Orientation
7. Plan of Work
8. Concrete Steps
9. Validation and Acceptance
10. Idempotence and Recovery
11. Artifacts and Notes
12. Interfaces and Dependencies

Keep sections short and specific. An explicit sentence covers a section with
nothing recorded yet. Put ordered commands, prerequisites and expected output
in Concrete Steps; retry/rollback in Idempotence and Recovery; receipts in
Artifacts and Notes; contracts in Interfaces and Dependencies. Keep essential
assumptions and external decisions understandable from the plan and its owning
guides without reconstructing a chat.

Date progress at milestones and handoffs. Split partial steps into completed and
remaining work, name the next step and blocker, and distinguish source completion,
local verification and observed deployment. Update discoveries, decisions and
outcomes as evidence changes. After acceptance, transfer operating guidance to its
subject guide, move the plan to completed, and fix index/inbound links. Move
optional follow-ups to [tech debt](tech-debt.md) or issues. Completed records may
retain their original format and must keep their dated evidence and uncertainty.

Run `npm run check:docs` for repository links and Markdown heading anchors,
index coverage, section order and nonempty active-plan sections. It runs inside
`npm run verify`; mechanical checks do not establish current deployment state.

This is our adapted repository convention, informed by OpenAI's
[harness engineering material](https://openai.com/index/harness-engineering/)
and [execution-plan example](https://developers.openai.com/cookbook/articles/codex_exec_plans).
We use a small entry map, indexed knowledge, resumable plans, observable acceptance,
safe retries and mechanical checks. Their example folder names and wording are
not universal requirements. The paired reference is
[data PR #509](https://github.com/foldaway/mrtdown-data/pull/509) at
`6db1a722c26acbb283d42d6d9fbef642c9ba521d`.

## Active

| Outcome | Remaining work |
| --- | --- |
| [Neon sleep](active/neon-sleep.md) | Verify later deployments, remaining wake-ups and sustained provider sleep. |
| [Fresh timetable projections](active/successor-projection-builds.md) | Measure fresh/repair runtime and prove bounded retries if needed. |
| [Generated system map](active/dynamic-system-map.md) | Review baseline, prove consumer import/rendering, migrate timeline versions. |
| [Production performance](active/production-performance.md) | Measure current latency/payload targets and resolve observed gaps. |
| [Reddit monitor](active/reddit-community-monitoring.md) | Verify sibling state, shadow comparison, 24-hour workflow and cutover. |
| [SEO deployment check](active/seo-remediation.md) | Record a complete crawl of the target deployment. |

## Completed

These records describe delivered work or superseded programs; they do not imply
that every proposed metric or production gate was accepted. Read each record's
scope and evidence before using it as a baseline.

- [Published serving inputs](completed/published-serving-inputs.md): range/arrival
  production receipts; later source slices and local verification.
- [Redis rollout](completed/redis-page-profile-cache.md): Navigation, completed
  Issue Profiles and service paths; incremental impact remains unmeasured.
- [Scoped-query egress work](completed/production-egress-reduction.md): July query
  delivery and transfer findings; superseded targets were not all met.
- [November timetable replay](completed/combined-timetable-pull-rollout.md):
  retained projection reuse and approved publication.
- [Performance foundations](completed/performance-foundations.md): scoped payloads,
  statistics and deferred UI source work, without fresh numerical acceptance.
- [SEO foundations](completed/seo-foundations.md): metadata/sitemap implementation
  and dated local crawl.
- [Programmatic reports](completed/programmatic-crowd-reports.md): site endpoint
  and reference catalog; monitor cutover remains open.
- [Crowd-reported arrivals](completed/crowd-reported-arrivals.md): short-lived
  branch observations beside scheduled departures.
- [Combined departure index](completed/combined-timetable-index.md): effective
  service dates, shared journeys and boarding access.
- [Scoped public reads](completed/scoped-public-read-model.md): bounded public
  readers and dated production read-reduction checks.
- [Query decomposition](completed/database-query-decomposition.md): layered
  query modules with preserved responses.
- [Crowdsourced reports](completed/crowdsourced-reports.md): collection,
  moderation, clustering and canonical dispatch.
- [Fly migration](completed/fly-migration.md): Node runtime and Upstash workflows.
- [Markdown delivery](completed/markdown-for-agents.md): curated discovery and
  app-owned Markdown alternatives.
- [Read-model overhaul](completed/overhaul-read-model.md): migration from the
  retired API client to the local relational model.
