# Markdown for Agents Plan

## Context

mrtdown should expose concise Markdown alternatives for agents and scrapers so
they can retrieve current transit status and canonical entity context without
parsing the React UI.

This plan follows the investigation in
`docs/investigations/2026-05-29-markdown-for-agents-feasibility.md`.

Relevant code:

- `app/routes`: file-based routes and route loaders.
- `app/routes/{-$lang}/sitemap[.]xml.tsx`: existing non-HTML route pattern.
- `app/util/*.functions.ts`: reusable server functions used by public pages.
- `app/util/db.queries.ts`: DB-backed read-model data assembly.
- `app/util/publicHtmlCache.ts`: existing public route cache policy.
- `public/robots.txt`: existing crawler discovery surface.

## Goals

- Add a curated `/llms.txt` entry point for agents.
- Add explicit Markdown routes for the highest-value public pages.
- Produce Markdown from read-model data, not by serializing or converting HTML.
- Keep Markdown content stable, concise, and link-rich enough for agent use.
- Preserve the existing HTML user experience and route behavior.
- Keep caching and feature-flag behavior aligned with the corresponding public
  HTML pages.

## Non-Goals

- Do not add all localized Markdown variants in the first pass.
- Do not add `/statistics/index.md`, history Markdown, or full-site dumps in the
  first pass.
- Do not add `.md` aliases such as `/lines/EWL.md` until analytics show demand.
- Do not make Cloudflare Markdown for Agents the source of truth for explicit
  Markdown URLs.
- Do not decide AI training/search policy through `Content-Signal` headers in
  this plan.

## Route Shape

Use directory `index.md` URLs as canonical:

- `/index.md`
- `/lines/$lineId/index.md`
- `/stations/$stationId/index.md`
- `/operators/$operatorId/index.md`
- `/issues/$issueId/index.md`

Use `en-SG` content for the first pass. Localized Markdown can be added later
after the base format and crawler behavior are understood.

## Phases

### Phase 1: Shared Markdown Surface

Create the shared primitives needed by all Markdown routes.

Tasks:

- Add a small Markdown serializer utility with helpers for headings, links,
  lists, tables, dates, durations, and escaping.
- Add a common response helper that sets `content-type:
  text/markdown; charset=utf-8` and public cache headers.
- Add tests for escaping, links, tables, and response headers.
- Decide whether the Markdown cache policy should reuse
  `app/util/publicHtmlCache.ts` directly or a generalized sibling helper.

Exit criteria:

- Markdown utility tests cover the formatting rules needed by the planned
  routes.
- A route can return cacheable `text/markdown` without duplicating header logic.

Status: complete. `app/util/agentMarkdown.ts` provides mdast-backed
serialization, date and duration helpers, GFM table support, and a cacheable
Markdown response helper with focused tests.

### Phase 2: Discovery Entry Point

Add `/llms.txt` as the stable agent entry point.

Tasks:

- Add a server route for `/llms.txt`.
- Include a concise site description and links to the canonical Markdown routes.
- Link to human-facing canonical pages where useful.
- Keep the file curated; do not generate a full sitemap replacement.

Exit criteria:

- `/llms.txt` returns valid Markdown-like text with `text/markdown`.
- The response gives agents enough context to find status, lines, stations,
  operators, and issues Markdown.

Status: complete. `/llms.txt` is served from a root route and advertises the
curated Markdown surface plus human-facing resources.

### Phase 3: Core Entity Routes

Add Markdown alternatives for public entity pages.

Tasks:

- Add `/index.md` using overview data.
- Add `/lines/$lineId/index.md` using line profile data.
- Add `/stations/$stationId/index.md` using station profile data.
- Add `/operators/$operatorId/index.md` using operator profile data.
- Add `/issues/$issueId/index.md` using issue data.
- Include public crowd-sourced report signals where the matching HTML data would
  include them.
- Reuse existing not-found behavior for missing entities.

Exit criteria:

- Each planned route returns concise, readable Markdown from read-model data.
- Route tests or integration checks cover success and not-found cases.
- No Markdown route serializes React-rendered HTML.

Status: complete. `/index.md`, line, station, operator, and issue Markdown
routes use existing read-model server functions and content builders. Tests cover
successful route delegation, cacheable Markdown responses, and preservation of
read-model 404 responses.

### Phase 4: Discovery and Observability

Expose and measure the new surface after the core routes are stable.

Tasks:

- Keep `/llms.txt` available at the conventional root URL without adding
  unsupported `robots.txt` directives.
- Decide whether to include Markdown URLs in the dynamic sitemap or keep them
  discoverable only through `/llms.txt`.
- Carry Cloudflare analytics or log inspection for `/llms.txt`, `index.md`,
  `.md`, and `Accept: text/markdown` traffic into the production performance
  observability plan.
- Revisit `.md` aliases only if logs show meaningful demand.

Exit criteria:

- Agents can discover `/llms.txt` at the conventional root URL.
- Sitemap inclusion and alias support have an explicit follow-up path based on
  observed traffic or product need.

Status: complete for launch. `/llms.txt` remains available at the conventional
root URL, Markdown routes stay out of the XML sitemap, unsupported `robots.txt`
directives are avoided, and `.md` aliases remain deferred. Production traffic
inspection moved to `docs/plans/active/production-performance.md` as a
post-launch observability follow-up.

## Progress Log

- 2026-05-29: Feasibility investigation completed and refined into a preferred
  app-owned Markdown route approach.
- 2026-05-29: Created this active plan.
- 2026-05-31: Added the shared Phase 1 Markdown surface with mdast-backed
  serialization helpers, GFM table support, date and duration formatting, and a
  cacheable `text/markdown` response helper.
- 2026-06-11: Added the Phase 2 `/llms.txt` discovery route with a curated
  agent entry point and links to current public resources. Deferred linking
  Phase 3 entity Markdown URLs until those routes exist, so agents do not
  follow advertised 404s.
- 2026-06-11: Added the Phase 3 `/index.md`, `/lines/$lineId/index.md`,
  `/stations/$stationId/index.md`, `/operators/$operatorId/index.md`, and
  `/issues/$issueId/index.md` routes backed by read-model server functions.
  Updated `/llms.txt` to advertise the new Markdown surface.
- 2026-06-11: Started Phase 4 discovery by exposing `/llms.txt` at the
  conventional root URL. Kept Markdown URLs out of the XML sitemap for now so
  the curated agent entry point remains the expansion surface.
- 2026-06-12: Expanded Markdown content tests for line, station, and operator
  builders so the Phase 3 entity formats are covered alongside overview and
  issue Markdown. Missing-entity behavior remains delegated to the shared
  read-model server functions used by the HTML routes.
- 2026-06-13: Added route-level tests for `/llms.txt`, `/index.md`, and the
  Phase 3 entity Markdown routes. The tests cover read-model delegation,
  cacheable `text/markdown` responses, and preservation of read-model 404
  responses for missing entities.
- 2026-06-13: Added discovery tests that assert Markdown routes stay out of the
  XML sitemap. Production traffic inspection for `/llms.txt`, `index.md`,
  `.md`, and `Accept: text/markdown` was left for a post-launch observability
  follow-up.
- 2026-06-13: Removed the unsupported `LLMS:` robots directive after Chrome
  Lighthouse flagged it as invalid. `/llms.txt` remains available at the
  conventional root URL, and robots discovery is limited to the standard XML
  sitemap directive.
- 2026-06-13: Local route validation found issue Markdown could crash on
  PostgreSQL-style timestamp strings such as `2026-06-10 01:00:00+00`.
  Updated the shared Markdown date parser to accept SQL timestamp strings and
  added regression coverage.
- 2026-06-13: Closed the plan as completed. The app-owned Markdown surface is
  implemented and covered by tests; production traffic inspection was carried
  into the production performance plan so sitemap inclusion and `.md` aliases
  can be revisited with post-launch data.

## Decision Log

- 2026-05-29: Use app-owned Markdown routes as the source of truth because they
  can be generated directly from read-model data and avoid HTML conversion
  noise.
- 2026-05-29: Use directory `index.md` URLs as canonical because they fit the
  current nested route structure and are close to Cloudflare's explicit docs
  links.
- 2026-05-29: Start with `en-SG` only to keep the first pass focused.
- 2026-05-29: Include public crowd-sourced signals when the corresponding HTML
  route includes them, so Markdown does not expose a different status product.
- 2026-05-29: Defer `Content-Signal` headers because AI training/search policy
  should be a separate product/legal decision.
- 2026-05-31: Use the mdast ecosystem for serialization
  (`mdast-util-to-markdown` plus `mdast-util-gfm`) instead of hand-assembling
  Markdown strings, so escaping and GFM tables follow maintained Markdown
  rules.
- 2026-06-11: Keep Markdown routes discoverable through `/llms.txt` instead of
  the dynamic XML sitemap until there is observed crawler demand for sitemap
  inclusion.
- 2026-06-13: Do not advertise `/llms.txt` with non-standard `robots.txt`
  directives; Lighthouse treats `LLMS:` as invalid, and the root `/llms.txt`
  convention is sufficient for the current agent entry point.
- 2026-06-13: Treat XML sitemap inclusion and `.md` aliases as observability-led
  follow-ups instead of launch blockers. Keep discovery curated through
  `/llms.txt` until production traffic shows meaningful demand.

## Validation

Run before handoff:

- `npm run verify`

Additional checks for implementation phases:

- Start the local app and request `/llms.txt` plus representative Markdown
  routes.
- Confirm `content-type`, cache headers, status codes, and not-found behavior.
- Confirm generated route-tree changes come from TanStack tooling, not manual
  edits.
