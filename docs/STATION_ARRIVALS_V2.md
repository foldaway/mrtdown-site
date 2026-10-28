# Station arrivals API v2

`GET /api/stations/{stationId}/arrivals/v2?lineId={lineId}&serviceId={serviceId}&destinationStationId={destinationStationId}`

The path station ID and three required query IDs identify one exact canonical
branch. Optional `platformId` further restricts it to a canonical platform at that
station. IDs are case-sensitive, 1–128 ASCII letters, digits, underscores or
hyphens. All other query fields, duplicate keys, empty values and URLs longer
than 2048 characters are rejected. Canonical existence and relationships are
checked inside the private reader's database snapshot.

The server chooses one request instant and queries the half-open interval
`[now, now + 60 minutes)`, returning at most 20 departures across all scheduled
platform groups (frequency fallback currently supplies at most two). Passengers
cannot choose a clock, horizon, result limit, topology, rollback or source review,
or internal test callback. These bounds constrain the requested scope/window and
response; the reader still validates retained history and merges candidate dates
before applying the result limit.

All responses use `Cache-Control: no-store`. Successful reads return HTTP 200
with `{ success: true, data: StationArrivalsV2 }`; the explicit TypeScript contract
and serializer live in `app/util/stationArrivalsV2.ts`.

- Common fields: `schemaVersion: 2`, canonical `scope`, `window` (start/end ISO
  instants and `limit: 20`), and `coverage`. Coverage includes `complete`,
  `untimedDepartureCount`, per-date selected source identity or null, deduplicated
  selection reason codes, minimal rollback status/blocker codes, and unavailable
  projection reason codes. Source identity is the immutable artifact
  `manifestSha256` plus original source `snapshotSha256`. No retained receipts,
  raw manifests, reviews, projection IDs or reporter rows are returned.
  Empty per-date `reasons` means no artifact was attempted; rollback status is
  recorded independently.
- `source: "scheduled"`: `reason` is `complete` or `incomplete`. `timings`
  groups carry canonical service/destination display names, destination code,
  alternative platform IDs and labels, and scheduled departures. Each departure
  preserves its ISO `time`, `basis: "scheduled"`, exact/approximate `precision`,
  canonical revision ID and occurrence identity: manifest/source hashes,
  Singapore `serviceDate`, opaque `providerTripId`, `providerStopId` and string
  `stopSequence`. Several alternative platforms describe one departure, not
  several trains. Crowd reports never shift these timestamps.
- `source: "frequency"`: `reason: "coverage-gap"`; `timing` carries canonical
  display names, destination code, platform labels and estimated departures.
  Their existing `basis` (`first_train`, `frequency_estimate`, `crowd_report` or
  `last_train`), confidence, headway/range in seconds, crowd-report count and
  disagreement flag are preserved. Platform IDs cannot be inferred from labels;
  platform-specific requests do not use frequency fallback.
- `source: "unavailable"`: no timing/departure payload. `reason` is
  `timetable-unavailable`, `frequency-unavailable`, or
  `frequency-scope-or-window-mismatch`; `coverage` explains the missing coverage.

`coverage.complete` describes scheduled coverage, not result exhaustion or full
service-day bounds. A complete empty schedule is authoritative. Untimed counts
cover the selected service dates and scope, because rows without a time cannot
be assigned to the query window. Partial scheduled coverage stays scheduled;
whole-window frequency estimates never fill its gaps. Rejected rollback and
projection failures remain unavailable. First/last-day bounds are not inferred.

Invalid syntax or unknown/inconsistent canonical scope returns HTTP 400 with
`{ success: false, error: "Invalid arrival scope or query" }`. Database, lineage,
promotion and other unexpected failures are logged server-side and return HTTP
500 with `{ success: false, error: "Arrival refresh failed" }`. Such failures
never become successful coverage gaps or expose exception strings.

This endpoint adds API capability only. The legacy arrivals endpoint and UI
remain unchanged. UI integration and any scheduled crowd overlay are later work;
real producer publication and mapping/source/release approvals remain independent
gates. This API neither grants approvals nor publishes or backfills GTFS data.
