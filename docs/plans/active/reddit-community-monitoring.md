# Programmatic Crowd Reports For Reddit Monitoring

## Context

`mrtdown-data-crawler` currently discovers Reddit submissions through an RSS
search and sends relevant posts into the MRTDown ingestion path once. That has
worked reliably for more than a year, but it cannot revisit a useful thread to
find replies that report changing delays, wider impact, corrections, or service
recovery.

The sibling `mrtdown-reddit-monitor` Cloudflare Worker will take over this
source-specific work. It will discover potentially relevant posts in
`r/singapore` and `r/askSingapore`, retain selected conversations in D1, parse
useful posts and replies into the same structured shape as commuter reports,
and submit each useful source object as one programmatic crowd report.

`mrtdown-site` does not need a Reddit subsystem. It only needs a small private
endpoint for authenticated machine producers. Reports received through that
endpoint should enter the existing crowd-report validation, moderation,
clustering, presentation, and dispatch pipeline.

Related references:

- `docs/plans/completed/crowdsourced-reports.md`
- `docs/DATA_PIPELINE.md`
- `app/routes/api.reports.tsx`
- `app/util/crowdReports.ts`
- `app/util/crowdReportDispatch.ts`
- `../mrtdown-reddit-monitor/README.md`

## Decision

Add a generic programmatic crowd-report endpoint to `mrtdown-site` and keep all
Reddit-specific acquisition and interpretation in `mrtdown-reddit-monitor`.

```text
Reddit post or useful reply
  -> mrtdown-reddit-monitor discovers, stores, and parses it
  -> POST /internal/api/crowd-reports
  -> existing mrtdown-site crowd-report pipeline
  -> existing crowd-report dispatch to mrtdown-data
```

The unit crossing the boundary is a crowd report, not a conversation,
observation event, claim, or community signal. A relevant thread produces one
report. A later relevant reply produces another report. For example, a reply
reporting that service has resumed is submitted with `isStillHappening: false`.

This supersedes the earlier community-observation and community-claim designs.
Do not add claim lifecycle, cross-source merging, Reddit conversation storage,
or a parallel community-signal product model to the site.

## Goals

- Accept structured crowd reports from a small number of registered machine
  producers without Turnstile or public IP-based rate limiting.
- Reuse the existing crowd-report schema and downstream behavior wherever the
  public and programmatic paths have the same semantics.
- Make producer retries safe with one stable external report ID.
- Retain enough generic provenance to identify the producer and inspect the
  upstream source when permitted.
- Keep route names, validation, database fields, and downstream code independent
  of Reddit.
- Preserve the existing crawler until the monitor demonstrates equivalent
  discovery coverage and successful reply monitoring.

## Non-Goals

- Store Reddit threads, comments, usernames, conversation trees, polling state,
  or Reddit credentials in `mrtdown-site`.
- Introduce community claims, claim versions, support aggregation, or a second
  signal lifecycle.
- Add a separate canonical `community-signal` ingest contract.
- Reconstruct conversations or correlate Reddit authors in the site.
- Batch reports in the first version.
- Publish an npm package or generated OpenAPI client for this small initial
  boundary.
- Replace the public human-report endpoint or weaken its Turnstile, abuse, and
  rate-limit protections.
- Make Reddit authoritative; the monitor still decides only whether a source
  object is useful enough to submit as a community report.

## Site Boundary

### Endpoint

Add:

```text
POST /internal/api/crowd-reports
Authorization: Bearer <producer secret>
Content-Type: application/json
```

Use a producer-specific bearer secret initially. The endpoint should reject
missing or invalid authentication before parsing or persisting a report. Keep
the authentication helper separate from the bearer token used by scheduled
site tasks so credentials can be rotated or revoked independently.

The request should add only generic delivery and provenance fields around the
existing structured crowd-report input:

```json
{
  "externalReportId": "opaque-producer-owned-id",
  "sourceUrl": "https://example.com/optional-upstream-source",
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

`externalReportId` is opaque to the site and unique within the authenticated
producer. The monitor may derive it from a source-object identity, but it
should not need to expose Reddit fullname syntax. `sourceUrl` is optional,
bounded, and must use an allowed HTTP or HTTPS origin policy.

The nested `report` uses the existing structured submission fields, excluding
public-only fields such as `turnstileToken` and `clientFingerprint`.

### Response and idempotency

Return `202` with the site report ID and moderation status when a report is
created. Repeating the same producer and `externalReportId` must return the
original result without creating another report. Reusing the ID with a
different payload should return `409`, making producer bugs visible rather than
silently changing a submitted report.

```json
{
  "success": true,
  "data": {
    "id": "site-report-id",
    "status": "accepted",
    "duplicateOfId": null,
    "idempotentReplay": false
  }
}
```

A single database uniqueness constraint on `(producer, external_report_id)` is
the idempotency boundary. A separate inbox or event table is unnecessary.

### Persistence

Extend `crowd_reports` with the minimum provenance required by both routes:

- a submission source or producer identifier, defaulting existing and public
  submissions to `public`;
- nullable external report ID;
- nullable upstream source URL;
- optionally a request payload digest if needed to detect conflicting retries.

Generate the migration through Drizzle. Do not create programmatic-report,
claim, observation, conversation, or delivery tables in the site.

Refactor the current persistence function into:

- shared structured-report insertion and automoderation;
- the existing public wrapper, which continues to record Turnstile, hashed
  client, abuse, and rate-limit state; and
- a programmatic wrapper, which records producer provenance but does not invent
  an IP address, Turnstile outcome, or browser fingerprint.

Programmatic submissions should reuse reference validation, duplicate
detection, clustering, cache invalidation, and dispatch triggering. Producer
policy may allow one authenticated report to be accepted without satisfying
the public distinct-IP threshold; this must be explicit at the wrapper call
site and covered by tests. Do not encode a fake producer identity in the
`crowd_report_abuse_events` table.

### Contract ownership

The route's Zod schema in `mrtdown-site` is the runtime source of truth. Keep a
concise request and response example in this plan and in the monitor README.
The monitor should treat `400` and `409` as non-retryable contract errors and
authentication or server failures according to their status and retry policy.

Do not add OpenAPI generation, vendoring, compatibility windows, or generated
consumer types until the boundary has more than one real producer or manual
contract drift becomes a demonstrated problem.

## Monitor Boundary

This plan does not implement the sibling Worker, but the site contract assumes
the following simple behavior:

1. Search configured feeds for new potentially relevant posts.
2. Parse a relevant post into the structured crowd-report fields.
3. Store the selected post and its delivery state in D1.
4. Submit it once through the programmatic endpoint, retrying until the site
   acknowledges its stable external report ID or returns a non-retryable
   error.
5. Start one Cloudflare Workflow for the selected thread.
6. Re-fetch replies approximately at `+10m`, `+25m`, `+40m`, `+55m`, `+3h`,
   `+6h`, and `+24h`.
7. Store and deduplicate replies in D1. Parse only new or materially changed
   source objects.
8. Submit each reply that contains a meaningful service update as its own
   programmatic crowd report.
9. Complete the workflow after the final poll.

The monitor owns relevance detection, Reddit transport, source storage,
workflow scheduling, source-object deduplication, parsing, and delivery retry.
The site neither knows nor cares whether a report originated from a post,
reply, edit, or another future producer.

## Measured Workload and Initial Cadence

A 2026-07-17 sample found approximately 54 new posts per day across the two
target subreddits and about 2.65 daily matches for a deliberately broad rail
keyword query. Manual sampling suggested only roughly one to three genuinely
live operational threads per month.

Reply traffic was front-loaded in representative disruption threads: roughly
77% to 88% of sampled replies arrived within three hours. This supports a small
fixed workflow schedule rather than a general polling scheduler or adaptive
watch queue. Start with four polls during the first hour, followed by polls at
three, six, and 24 hours. Change the cadence only after observing missed useful
updates or unnecessary request volume.

## Implementation Plan

### Phase 1: Add the programmatic endpoint (completed 2026-07-18)

- Define the small authenticated request schema alongside the crowd-report
  domain code.
- Add generic provenance and external-ID fields to `crowd_reports` through a
  generated Drizzle migration.
- Refactor shared persistence so the public and programmatic routes use the
  same structured validation and automoderation without sharing public abuse
  assumptions.
- Add `POST /internal/api/crowd-reports`.
- Trigger the existing dispatch and cache-purge behavior after a successful new
  report.

Exit criteria:

- A valid authenticated request creates one normal crowd report.
- A retry returns the existing report without duplicating joins, moderation,
  clustering, cache work, or dispatch.
- A conflicting retry returns `409`.
- Invalid credentials and malformed reports are rejected.
- The public endpoint retains its current behavior.
- No Reddit-specific route, schema, or table name exists in the site.
- `npm run verify` passes.

### Phase 2: Integrate the monitor in shadow mode

- Give the monitor a producer credential and the site endpoint URL.
- Accept reports in staging or private inspection while public/canonical output
  remains disabled if needed for evaluation.
- Compare discovered relevant posts with `mrtdown-data-crawler`.
- Inspect whether parsed replies add useful updates and whether resolution
  reports behave correctly in the existing pipeline.

Exit criteria:

- Relevant posts are not lost across retries or repeated discovery.
- Useful replies appear as separate reports with correct observation times.
- Irrelevant discussion does not produce reports at an unacceptable rate.
- The team is satisfied with initial report trust and moderation policy.

### Phase 3: Cut over

- Enable the normal crowd-report dispatch behavior for the registered producer.
- Observe at least one complete 24-hour thread workflow.
- Disable Reddit discovery and dispatch in `mrtdown-data-crawler`, retaining a
  short rollback window.
- Remove the crawler path in a separate focused change after the new path is
  proven.

Exit criteria:

- The monitor covers new relevant threads at least as well as the crawler.
- Reply updates reach the existing crowd-report pipeline.
- Retries do not create duplicate reports or canonical dispatches.
- Only the monitor/site path produces new Reddit-derived reports.

## Decisions

- 2026-07-17: Use a dedicated Worker because frequent mostly-empty Reddit
  discovery is a better fit for Cloudflare scheduling than waking the
  scale-to-zero site.
- 2026-07-18: Keep Reddit discovery in the existing crawler until the new
  monitor demonstrates equivalent coverage.
- 2026-07-18: Supersede the community-observation and community-claim designs
  with a programmatic crowd-report endpoint feeding the existing site pipeline.
- 2026-07-18: Keep conversations and workflow state entirely in the monitor;
  each useful post or reply becomes one independent structured report.
- 2026-07-18: Use one generic external report ID for retry safety instead of an
  event inbox, claim version, or site-side lifecycle.
- 2026-07-18: Defer OpenAPI generation until multiple producers or observed
  contract drift justify it.

## Validation

Run `npm run verify` after implementation. The endpoint test suite should cover
authentication, schema validation, missing station/line references,
idempotent retry, conflicting retry, programmatic trust policy, dispatch
triggering, and unchanged public endpoint behavior.
