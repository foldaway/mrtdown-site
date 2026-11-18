# Execution Plans

## When to write a plan

Use an in-session checklist or the PR description for bounded work with a clear
path to implementation and verification. Routine bug fixes, documentation
updates, and changes covered by an existing runbook usually fit this approach.

Write a versioned plan when ordered milestones span PRs or repositories, when
a migration or production cutover needs coordinated validation and recovery,
or when decisions, open questions, or blockers must survive a handoff. A
routine deploy can follow the existing procedure. A timetable source cutover
that coordinates release pins, approvals, and workflow schedules needs a plan.
Update an existing plan when it covers the work. Start one if a checklist grows
into work that needs durable context.

## Maintaining a plan

Follow the [writing policy](../development/writing.md). Keep the purpose and
next step easy to find.

1. Copy the [shared template](template.md) to `active/<topic>.md` and link it
   below. Keep its second-level headings in order. Use lower-level headings
   for subject-specific detail.
2. Write milestones someone can verify from a fresh checkout. Include enough
   context and links to run the checks and recognize success.
3. Update progress, discoveries, decisions, and outcomes as the work proceeds.
   A handoff should identify the last verified result, the next step, and any
   blocker.
4. After acceptance, record the outcome and verification, move the plan to
   `completed/`, and update the index and inbound links. Carry lasting
   operating guidance to its subject guide. Link issues or active plans for
   deferred work. Keep completed plans as historical records.

Run `npm run check:docs` to check local links, plan index entries, and the
section order of active plans. The same check runs with `npm run verify`.

The repository map and living plans follow OpenAI’s
[Harness Engineering approach](https://openai.com/index/harness-engineering/)
and [execution plan guide](https://developers.openai.com/cookbook/articles/codex_exec_plans).

## Active

- [Combined timetable pull rollout](active/combined-timetable-pull-rollout.md):
  records the November cutover and tracks safe successor projection builds.
- [Dynamic system map](active/dynamic-system-map.md): canonical schematic map
  data and data-driven site rendering.
- [Production performance](active/production-performance.md): public route
  latency and payload reduction plan.
- [Production egress reduction](active/production-egress-reduction.md): reduce
  remaining database transfer from scoped issue, date-range, and static
  topology reads.
- [Cache public page profiles in Redis](active/redis-page-profile-cache.md)
  records the production rollout and pending service-path egress comparison.
- [Reddit community monitoring](active/reddit-community-monitoring.md):
  stateful Reddit thread and reply monitoring through authenticated
  programmatic crowd reports and canonical reference validation.
- [SEO remediation](active/seo-remediation.md): crawl-clean sitemap output,
  canonical metadata, locale alternates, and metadata quality fixes.

## Completed

- [Crowd-reported arrivals](completed/crowd-reported-arrivals.md) restored
  short-lived branch-level rider reports beside scheduled departures.
- [Combined timetable departure index](completed/combined-timetable-index.md)
  indexes effective Singapore service dates and shared journeys with
  per-service boarding access.
- [Scoped public read model](completed/scoped-public-read-model.md): replaced
  request-time complete-dataset reads with typed, entity-scoped readers and
  verified the production read reduction through cold-cache checks and restart.
- [Database query decomposition](completed/database-query-decomposition.md):
  split the monolithic read-model query module into layered dataset, domain,
  maintenance, and feature modules without changing public responses.
- [Crowdsourced reports](completed/crowdsourced-reports.md): site-local public
  report collection, moderation, clustering, and canonical ingest dispatch.
- [Fly.io migration](completed/fly-migration.md): migration from Cloudflare
  Workers to a Fly-hosted Node runtime with Upstash workflows and Redis.
- [Markdown for agents](completed/markdown-for-agents.md): `llms.txt` and
  app-owned Markdown alternatives for agents and scrapers.
- [Overhaul read model](completed/overhaul-read-model.md): local
  Postgres-backed read model migration.
