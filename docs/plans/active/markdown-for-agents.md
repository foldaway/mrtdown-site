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

### Phase 4: Discovery and Observability

Expose and measure the new surface after the core routes are stable.

Tasks:

- Add `/llms.txt` to `public/robots.txt`.
- Decide whether to include Markdown URLs in the dynamic sitemap or keep them
  discoverable only through `/llms.txt`.
- Inspect Cloudflare analytics or logs for `/llms.txt`, `index.md`, `.md`, and
  `Accept: text/markdown` traffic.
- Revisit `.md` aliases only if logs show meaningful demand.

Exit criteria:

- Crawlers can discover `/llms.txt`.
- There is an explicit follow-up decision on sitemap inclusion and alias support
  based on observed traffic or product need.

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
- 2026-06-11: Started Phase 4 discovery by adding `/llms.txt` to
  `public/robots.txt`. Kept Markdown URLs out of the XML sitemap for now so the
  curated agent entry point remains the expansion surface.
- 2026-06-12: Expanded Markdown content tests for line, station, and operator
  builders so the Phase 3 entity formats are covered alongside overview and
  issue Markdown. Missing-entity behavior remains delegated to the shared
  read-model server functions used by the HTML routes.
- 2026-06-13: Added route-level tests for `/llms.txt`, `/index.md`, and the
  Phase 3 entity Markdown routes. The tests cover read-model delegation,
  cacheable `text/markdown` responses, and preservation of read-model 404
  responses for missing entities.
- 2026-06-13: Added discovery tests that assert `/llms.txt` is advertised from
  `public/robots.txt` and that Markdown routes stay out of the XML sitemap.
  Production traffic inspection for `/llms.txt`, `index.md`, `.md`, and
  `Accept: text/markdown` remains the open Phase 4 follow-up.

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

## Validation

Run before handoff:

- `npm run verify`

Additional checks for implementation phases:

- Start the local app and request `/llms.txt` plus representative Markdown
  routes.
- Confirm `content-type`, cache headers, status codes, and not-found behavior.
- Confirm generated route-tree changes come from TanStack tooling, not manual
  edits.
