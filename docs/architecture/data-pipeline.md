# Data Pipeline

The site imports canonical mrtdown archives into Postgres. Server functions
use [feature queries](../../app/util/dbQueries) backed by normalized SQL tables
or completed published serving inputs, as described below.

## Canonical pull

The authenticated `POST /internal/api/tasks/pull` queues an import and returns
its workflow run ID. `GET` on the same route with `workflowRunId` reports that
exact canonical pull's state. A successful new pull also returns its requested
`combinedReleaseIndex` after the import, cache publication and lease release
finish. Publishers must match both the run and release identity before advancing
their baseline; HTTP 202 alone only means queued. Responses are uncached and omit
workflow steps, payloads and headers. Pre-existing runs without the new receipt
cannot confirm an exact release to an automated publisher.

The [pull workflow](../../app/workflows/pull/index.ts) snapshots the source
manifest, verifies any advertised timetable, stages canonical entities in
`*_next` tables, and promotes them before refreshing derived data. Staging
passes data between workflow steps without putting large payloads into QStash
step outputs.

The [pull fingerprint](../../app/workflows/pull/helpers/manifestFingerprint.ts)
lets an unchanged pull skip the archive download and rebuilds. It ignores the
manifest's publication time and is saved only after the pull succeeds.
Bump the pipeline version when a code change requires a full pull with
unchanged upstream data.

Live topology readers require the completed-promotion marker even inside a
repeatable-read transaction. Promotion spans multiple transactions, so a
reader can otherwise see a stable snapshot of a partially promoted network.
A failed promotion keeps the marker and successful fingerprint cleared so a
retry can repair the state. See the
[live topology loader](../../app/util/dbQueries/readLiveScheduleTopology.ts).

### Published range serving inputs

`REDIS_RANGE_SNAPSHOT=enabled` selects a completed Redis snapshot before any
range SQL connection or generation read. The snapshot contains canonical source
rows; dataset assembly still uses the request clock. Canonical publication
loads one repeatable-read snapshot after generation completion, then atomically
commits its content-addressed payload and active pointer. The previous completed
snapshot remains readable during promotion. Independent holiday changes also
republish before their purge; manual facts rebuilds do not change range inputs.

The external completed-fingerprint checkpoint is written after publication,
purge and the successful SQL fingerprint. Enabled unchanged polls validate
upstream inputs and the recoverable Redis snapshot before acquiring a SQL
lease. Changed/explicit inputs and missing snapshots keep the normal writer
path. This does not remove SQL from arrivals, entity profiles or community
signals. The [snapshot runbook](../operations/edge-caching.md#published-zero-sql-range-inputs)
owns limits, recovery and rollout; the [sleep plan](../plans/active/neon-sleep.md)
tracks the remaining wake-ups.

### Arrival topology reuse

Finalization also validates and hashes the actual live schedule topology, then
atomically records `canonical_topology_attestation_v1` with the promotion marker
and last-pull timestamp. The first live promotion write clears the attestation.
This runs independently of cache flags. Pipeline version 7 forces one full pull
for unchanged upstream inputs; timetable pins, admission and projection reuse
retain their existing rules.

Set `SCHEDULE_TOPOLOGY_MEMO=enabled` to reuse this topology inside each Node
process. It defaults to disabled. The [reader](../../app/util/dbQueries/scheduleTopologyCache.ts)
checks promotion and attestation through the arrival request's read-only
repeatable-read transaction. A warm hit skips all 11 topology-table reads;
history, eligibility, coverage, departures and display names still use SQL.
Arrival responses remain `no-store`, and rider reports remain fresh.

The memo holds one object of at most 1 MiB per database handle, cloned for each
caller. Cold processes, invalid/missing attestation, digest disagreement or
oversized topology use the original SQL loader. Missing promotion completion
still fails closed. Page-profile generation and Redis publication do not select
or validate arrival topology. Facts and holiday rebuilds do not invalidate it.

Before enabling in an environment, drain older pull executions and let a full
pull establish the attestation. No seed or timetable artifact cache is needed.
Topology repairs must use the promotion protocol; direct table edits must first
clear the promotion marker and attestation. An older finalizer's last-pull
timestamp mismatch forces SQL fallback. Validation now happens at finalization,
so malformed topology prevents that promotion from completing.

`schedule_topology_read` logs source, bypass reason, duration, selected-row count,
encoded JSON bytes on SQL loads, and promotion token. Counts and bytes are
diagnostic proxies, not billed network transfer. `schedule_topology_load` and
`schedule_topology_rows` also appear in Server-Timing. To roll back, unset only
`SCHEDULE_TOPOLOGY_MEMO`; reads immediately use SQL without an edge purge. Keep
attestation maintenance enabled. See the [investigation](../investigations/2026-11-18-station-arrival-topology.md)
for evidence, parity checks and the pending production measurement.

## Timetable admission

Three checks apply to each new release:

1. **Release identity.** Verify a legacy bundle under
   `data/scheduled-timetable/` against the entry in the configured Pages
   manifest. Combined releases use the approved pin below.
2. **Canonical compatibility.** The importer checks against the canonical
   data from the same archive before staging or projecting the timetable.
3. **Source order.** Start the pull with an authenticated
   `POST /internal/api/tasks/pull` and `{ "sourceReview": <review> }`.
   Use the exact retained predecessor and advertised successor for the
   environment. See the [request schema](../../app/workflows/pull/helpers/pullParams.ts).
   The recurring pull sends an empty body.

[Retention](../../app/util/dbQueries/retainScheduledTimetable.ts) preserves
original bytes and the first receipt. An already-retained release preserves
its receipt and still requires a compatibility check. If projection or
canonical staging fails after admission, the retained receipt can survive.
It records admission only. If the upstream archive changed between workflow
steps, restore the expected archive for a retry or start a new pull using the
new manifest and its review.

### Combined timetable imports

For a combined release, put the producer's `manifest.json`, `timetable.json`
and `release.json` at the exact `data/combined-timetable/` paths in the canonical
ZIP. Set the staging or production GitHub deployment environment variable
`MRTDOWN_COMBINED_RELEASE_INDEX` to the independently approved release index
JSON (only `manifestSha256` and `releaseSha256`). Deploy passes the value to
the Fly app at runtime, so the managed daily QStash pull keeps its empty body
and schedule sync leaves the pin in place. Leave the variable unset for a
canonical-only source. An authenticated one-off pull can supply
`combinedReleaseIndex` when no deployment pin is set. When both are present,
both digests must match. An index from the archive or its origin cannot
authorize import. One pull accepts one timetable format.

The workflow snapshots the resolved index with the source URL, canonical
manifest and import clock so callbacks keep the same inputs across a deploy.
Rotate the configured pin and source together after draining active pulls. An
old signed request can conflict with a new pin, and a stale archive fails
verification. A pin change forces the next pull to download the archive.
Keep review and artifact contents out of deployment variables and schedule
bodies. See the [timetable rollout plan](../plans/active/combined-timetable-pull-rollout.md)
for staging acceptance and preview options.

### Projection and repair

The [projector](../../app/util/dbQueries/projectScheduledTimetable.ts) builds
departure rows and date/scope coverage separately from retained archives.
The [projection schema](../../app/db/scheduledDepartures.schema.ts) defines
storage for legacy and combined formats. The retained receipt chain determines
source ordering.

A pull can reuse a completed projection when the release, projector version,
topology, and date coverage still match. Reuse leaves the stored departures
untouched. The [rollout plan](../plans/active/combined-timetable-pull-rollout.md)
records the checks that verified replay.

For intentional repair, send `{ "rebuildScheduledTimetableProjection": true }`
on an authenticated pull. It bypasses the fingerprint skip and projection
reuse. When the projector fails, it rolls back partial writes and marks the
projection incomplete. A successful retry restores it.

### Departure selection

The [selector](../../app/util/dbQueries/withSelectedScheduledTimetable.ts) and
[window reader](../../app/util/dbQueries/queryIndexedScheduledDepartures.ts)
read live topology, coverage, and departures in one database snapshot. Use
the selection within that snapshot. An ID obtained from it serves as
provenance afterward.

- Each Singapore service date can fall back to an older eligible release in
  the retained chain. A covered date with zero active trips can establish an
  authoritative empty result. A missing date or scope, or an unassigned
  active trip, cannot establish coverage.
- Overnight offsets can bring an earlier service date into the query window.
  An unavailable projection can hide such dates even when an older release
  supplies some departures. Untimed boardable stops count toward incomplete
  coverage because they cannot be assigned to an instant.
- An operator rollback needs an authenticated review and an independently
  supplied selection clock. It binds the current and older release, dates,
  and exact scope. A review without a platform applies only to branch-wide
  requests, and exact-destination reviews do not apply to loop-wide queries.
  A rejected applicable review makes the affected dates unavailable. Review
  application leaves the retained releases and projections intact.

See the [station arrivals API](../api/station-arrivals-v2.md) for passenger
window and coverage semantics.

## Public Holiday Workflow

`app/workflows/publicHolidays/index.ts` syncs Singapore public holidays from the
data.gov.sg consolidated public holidays dataset into `public_holidays`.
Holiday changes rebuild operational facts for affected dates so line service
windows use weekend timings on public holidays. QStash has a separate monthly
schedule for this workflow; use
`/internal/api/tasks/public-holidays` for an immediate manual refresh after an
out-of-cycle update.

## Scheduled Jobs

The staging and production deployment workflows run
`npm run qstash:schedules:sync` after a successful Fly deployment. The command
idempotently creates or updates the QStash schedules for the canonical pull,
public holiday sync, and crowd report dispatch. Schedule IDs include `TIER`, so
the environments can share one QStash account without overwriting each other.
Canonical pulls run daily at 00:00 UTC in those environments. Preview resets
its database and queues a pull as part of every deployment, so it has no
recurring schedules.

Configure `QSTASH_URL`, `QSTASH_TOKEN`, and `INTERNAL_API_TOKEN` as secrets in
each GitHub deployment environment. The deployment workflow supplies `TIER`
and `VITE_ROOT_URL`; `INTERNAL_API_TOKEN` must match one of the target app's
`INTERNAL_API_TOKENS`. Configure `QSTASH_CURRENT_SIGNING_KEY` and
`QSTASH_NEXT_SIGNING_KEY` on each Fly app; workflow endpoints reject requests
when either key is missing outside local `QSTASH_DEV` mode. To inspect the
configuration locally without calling QStash, set the schedule variables and
run:

```sh
npm run qstash:schedules:sync -- --dry-run
```

The [sync script](../../.github/scripts/syncQstashSchedules.mjs) manages
only its three schedule IDs. Cron expressions use UTC.

## Operational Facts

[Operational facts](../../app/util/dbQueries/operationalFacts.ts) precompute
service time, downtime, and issue summaries for public reads. Facts keep the
issue counts for lines with unknown start dates or hours. They skip
service-window and clipped downtime calculations when those inputs are unknown.

After operational facts, the canonical pull refreshes the persisted statistics
and sitemap snapshots before purging the public edge-cache tag. Statistics and
sitemap requests require those successfully rebuilt projections in every
environment. Missing or invalid snapshots fail with instructions to apply
migrations and run the canonical pull or authenticated facts rebuild.

## Crowd Report Dispatch

Accepted reports trigger a best-effort dispatch after commit. Pending reports
can retry through `/internal/api/tasks/crowd-report-dispatch`, which sends
canonical evidence to the `mrtdown-data` ingest workflow. See the
[clustering rules](../../app/util/crowdReportClustering.ts) and
[dispatch implementation](../../app/util/crowdReportDispatch.ts).

Configure `CROWD_REPORT_DISPATCH_GITHUB_TOKEN` as a deployed secret. Optional
overrides are `CROWD_REPORT_DISPATCH_GITHUB_OWNER`,
`CROWD_REPORT_DISPATCH_GITHUB_REPO`, and
`CROWD_REPORT_DISPATCH_GITHUB_EVENT_TYPE`. The canonical evidence source URL is
built from `VITE_ROOT_URL` as a stable `/community-reports/{kind}/{id}`
permalink. Send `{ "dryRun": true }` to the endpoint to inspect pending payloads
without calling GitHub or mutating report state.

The weekly Sunday 18:00 UTC QStash schedule invokes the same dispatch path as a
retry backstop when `CROWD_REPORT_DISPATCH_GITHUB_TOKEN` is configured. This
gives the upstream ingest workflow six hours before the following daily
canonical pull. Use
`CROWD_REPORT_DISPATCH_LIMIT` to tune the maximum number of dispatch candidates
processed per scheduled run.

For failures, look in Sentry for `component:crowd-report-dispatch` and the
`crowd_report_dispatch` context. Scheduled delivery diagnostics include
QStash message and schedule IDs. Submission-triggered failures carry
`trigger:submission`. Validation details are sanitized.

### Programmatic crowd reports

Registered machine producers submit structured reports to
`POST /internal/api/crowd-reports` with their own bearer credential. Configure
the credentials and permitted upstream origins as a JSON map in
`CROWD_REPORT_PRODUCERS`:

```json
{
  "reddit-monitor": {
    "token": "replace-with-a-long-random-secret",
    "sourceOrigins": ["https://www.reddit.com"]
  }
}
```

The request wraps the public structured-report fields with a producer-owned
idempotency key and optional upstream URL:

```json
{
  "externalReportId": "opaque-source-object-id",
  "sourceUrl": "https://www.reddit.com/r/singapore/comments/example",
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

A new report and an identical replay both return `202`; the response sets
`idempotentReplay` to distinguish them. Reusing an external ID with a different
payload returns `409`. Programmatic reports bypass public Turnstile, IP rate
limits, and distinct-IP confidence requirements, but retain the same reference
validation, moderation, clustering, cache purge, and canonical dispatch path.

Registered producers can fetch the compact validation catalog from
`GET /internal/api/reference-catalog/v1` with the same bearer credential. The
response includes its schema version, the timestamp of the last completed
canonical data pull, the current Singapore reference date, active line validity
windows, active stations, and active station-to-line code memberships. Station
`aliases` are a deduplicated flat projection of the canonical localized names;
the site does not currently store a separate alias dataset.

Consumers should cache the catalog briefly, reject unknown identifiers before
delivery, and refresh after a dataset-version change. The submission endpoint
remains authoritative and still validates references against each report's
`observedAt` date.
