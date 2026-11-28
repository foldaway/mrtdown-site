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

With `REDIS_URL` configured, range reads select a completed Redis snapshot before any
range SQL connection or generation read. The snapshot contains canonical source
rows; dataset assembly still uses the request clock. Canonical publication
loads one repeatable-read snapshot after generation completion, then atomically
commits its content-addressed payload and active pointer. The previous completed
snapshot remains readable during promotion. Independent holiday changes also
republish before their purge; manual facts rebuilds do not change range inputs.

The external completed-fingerprint checkpoint is written after publication,
purge and the successful SQL fingerprint. Unchanged polls validate
upstream inputs and the recoverable Redis snapshot before acquiring a SQL
lease. Changed/explicit inputs and missing snapshots keep the normal writer
path. Profiles and directories use a separate published graph. The
[snapshot runbook](../operations/edge-caching.md#published-zero-sql-range-inputs)
owns limits and recovery; the [sleep plan](../plans/active/neon-sleep.md)
tracks the remaining wake-ups.

### Published profile and directory inputs

Canonical and holiday publication write one completed source graph for station,
line, operator and town profiles and station/line/town directories. Authenticated
facts rebuilds republish its facts under the same writer boundary. Request-time
assembly retains dated memberships, issue state and ranking windows; it does not
synthesize absent facts. HTML, server functions and Markdown share the loaders.

Missing or invalid publications use lazy uncached SQL recovery. The
[profile runbook](../operations/edge-caching.md#published-station-profile-inputs)
owns bounds, expiry, pending-holiday guards and repair. Community signals have
independent write-driven publication and display expiry.

### Published Issue Profile inputs

Full Issue Profile reads share the bounded snapshot store and station scope
helpers. Canonical pulls and explicit repair publish completed source rows and
public updates before purge/checkpoint; requests assemble at their own clock.
Unused title metadata and redacted text/translations are excluded. Unknown IDs
and invalid snapshots retain uncached SQL recovery. Holiday/facts rebuilds do not
change these inputs. See the [runbook](../operations/edge-caching.md#published-issue-profile-inputs)
for bounds, retention and response-time publication checks.

### Arrival serving and SQL recovery

Healthy arrival requests use coherent published metadata and departure partitions
with the existing admission/coverage policy. See the
[arrivals runbook](../operations/edge-caching.md#published-arrivals-reader).
The SQL recovery path retains a process-local topology memo validated inside its
repeatable-read transaction against completed promotion and topology attestation.
It avoids repeated topology-table transfer but still uses SQL; it cannot prove
idle suspension. The [reader](../../app/util/dbQueries/scheduleTopologyCache.ts)
owns memo bounds and diagnostics.

Canonical finalization establishes attestation; promotion clears it before live
writes. Direct topology repair must follow that protocol. The
[November investigation](../investigations/2026-11-18-station-arrival-topology.md)
records the original SQL-path measurement and parity evidence.

Long timetable imports use `PULL_WORKFLOW_URL` for the signed QStash pull
endpoint. Production and staging target their direct Fly HTTPS origins so
Cloudflare response limits do not interrupt projection builds. Public links
continue to use `VITE_ROOT_URL`. The authenticated completion endpoint accepts
receipts from both the configured workflow URL and the previous public URL.
Fly permits up to fifteen minutes of idle response time for these requests;
producer polling still requires an exact successful release receipt.

## Timetable admission

Three checks apply to each new release:

1. **Release identity.** Verify a legacy bundle under
   `data/scheduled-timetable/` against the entry in the configured Pages
   manifest. Combined releases use the current public Pages index, read
   independently of the archive. A signed request must match that index.
2. **Canonical compatibility.** The importer checks against the canonical
   data from the same archive before staging or projecting the timetable.
3. **Source order.** The public publication receipt supplies the exact source
   review for an ordinary combined release. The importer verifies it against
   the retained predecessor and advertised successor. A reviewed exception can
   supply a source review in an authenticated pull request. See the
   [request schema](../../app/workflows/pull/helpers/pullParams.ts).
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
ZIP. Pages publishes `combined-timetable-release-index.json` and
`combined-timetable-publication.json` outside the archive. The site reads both,
checks that their index and source review agree, then verifies the archive's
exact bytes and canonical topology. The managed daily pull keeps its empty
body. Older published releases without a publication receipt can replay their
already retained import using the public index; an unseen source still needs
a signed review. One pull accepts one timetable format.

The workflow snapshots the resolved index with the source URL, canonical
manifest and import clock so callbacks keep the same inputs across a deploy.
Change the source after draining active pulls. A stale archive fails verification.
Keep artifact contents out of deployment variables and schedule bodies. See
[timetable operation](../operations/timetable-imports.md)
for rotation, replay verification and preview options.

### Projection and repair

The [projector](../../app/util/dbQueries/projectScheduledTimetable.ts) builds
departure rows and date/scope coverage separately from retained archives.
The [projection schema](../../app/db/scheduledDepartures.schema.ts) defines
storage for legacy and combined formats. The retained receipt chain determines
source ordering.

A pull can reuse a completed projection when the release, projector version,
topology, and date coverage still match. Reuse leaves the stored departures
untouched. The [November replay record](../plans/completed/combined-timetable-pull-rollout.md)
records the dated checks; [timetable operation](../operations/timetable-imports.md)
owns the reusable procedure.

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

Each fact rebuild commits its requested daily rows and station projection
atomically. A failed batch or station projection leaves the previous fact set
usable; row computation and inserts remain batched. Profile publication checks
pending holiday fact dates so unrelated repair cannot combine newly committed
holidays with unfinished facts. The holiday workflow supplies its completed dates
after checking its existing writer lease and checkpoint token.

After operational facts, the canonical pull refreshes the persisted statistics
and sitemap snapshots before purging the public edge-cache tag. Statistics and
sitemap requests require those successfully rebuilt projections in every
environment. Missing or invalid snapshots fail with instructions to apply
migrations and run the canonical pull or authenticated facts rebuild.

### Published statistics

With Redis configured, `/statistics` reads the bounded immutable
[statistics publication](../../app/util/statisticsSnapshot.server.ts). Healthy
cold and warm reads use no SQL or freshness probes. Active payloads persist;
replaced payloads expire after 24 hours. Missing, invalid or unavailable Redis
inputs recover lazily from SQL with `Cache-Control: no-store`. SQL-only local
reads retain the existing missing/incomplete snapshot errors.

The canonical pull publishes after generation completion, before purge and the
unchanged-input checkpoint. The authenticated facts task shares the writer
lease, rebuilds and republishes, and invalidates that checkpoint before mutation
so the next canonical pull repairs interrupted publication. The unchanged-pull
preflight verifies the statistics payload and matching fingerprint/generation.
Publication rejects partial generations and delayed activation. Legacy complete
SQL snapshots without generation provenance need one coherent rebuild during
repair; incomplete snapshots still require the documented rebuild.

Charts, longest-disruption references and included entities retain the persisted
rebuild clock (`as_of`), including ongoing-issue durations and rolling windows.
Midnight or an unchanged-pull repair does not advance them. They advance on the
next statistics rebuild, as before; this cache does not promise daily freshness
when an unchanged canonical pull skips rebuilding. Holiday sync changes service
windows in line facts but does not rebuild the statistics projection; its issue
counts and durations do not depend on holiday service hours.

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

Authenticated dispatch requests can return no work before opening SQL when the
[community snapshot](../operations/edge-caching.md#public-community-disruption-signals)
certifies there are no accepted, undispatched clusters or standalone reports.
Accepted rows keep SQL discovery enabled even without sufficient scope or
confidence; display expiry cannot hide retries. Immediate dispatch and dry runs
always discover through SQL. Eligibility currently changes only through writes;
adding a clock-based eligibility or retry deadline requires revisiting the proof.

The existing publication fence invalidates before relevant SQL commits and
refreshes afterward. Missing, dirty, corrupt, unavailable or older snapshots
without the queue field fall back to SQL. Empty runs repair the proof from SQL;
older fenced writers safely omit the field when rebuilding. Drain writers
predating the fence before initialization. Redis restores, out-of-band SQL edits
and writes without Redis require the linked snapshot repair procedure.

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
