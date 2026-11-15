# Crowd-Reported Arrivals

> Both phases shipped in [PR #302](https://github.com/foldaway/mrtdown-site/pull/302).

## Context

The timetable rollout retired frequency calibration and the original arrival
report form. A short-lived report from a station display can supplement the
published timetable. The [arrivals API contract](../../api/station-arrivals-v2.md)
describes both sources.

## Goals

- Restore reporting for the current station, service and direction.
- Show the latest accepted report on the matching branch, including branches
  without timetable coverage.
- Keep the timetable usable during report lookup and submission failures.

## Non-Goals

- Frequency calibration, trip matching, or assigning reports to platforms.
- Disruption report dispatch, canonical ingest, and timetable publication.

## Phases

### Phase 1 — Store and read reports

- Reuse `crowd_arrival_reports`. Validate the active service revision and
  destination, record server receipt time, and enforce the reporter cooldown
  in the write transaction.
- Read the latest report for branch-level v2 responses. Expire it at five
  minutes or one minute after the reported arrival, whichever comes first.

Exit criteria

- Tests verify canonical scope, cooldown, expiration, and timetable responses
  when the report lookup fails.

### Phase 2 — Restore station-guide reporting

- Display rider reports separately from published times. Refresh the guide after
  submission and let riders retry when a submission times out.

Exit criteria

- Desktop and mobile riders can submit and see a report. A failed request
  returns the form to an actionable state.

## Progress Log

- 2026-11-14 — Implemented both phases in PR #302. Verified concurrent writes
  and expiry in disposable PostgreSQL and checked the guide in Chromium.

## Decision Log

- 2026-11-14 — Reports are branch-level observations. Published departures
  retain their times and platform assignments.
- 2026-11-14 — For requests on Fly, use Cloudflare's visitor header only when
  Fly reports a peer in Cloudflare's published origin-facing ranges.

## Validation

- Run `npm run verify`, including database integration tests against disposable
  PostgreSQL with its default time zone set to UTC.
- Check simultaneous submissions and expiration with the real schema.
- Check a stalled submission and retry in Chromium and cover the Fly and
  Cloudflare address selection in unit tests.
