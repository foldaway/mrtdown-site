# Data Pipeline

The overhaul introduces a local read model for canonical mrtdown data.

## Pull Workflow

`app/workflows/pull/index.ts` defines the Upstash Workflow entrypoint. It:

- fetches the manifest and archive from `MRTDOWN_DATA_URL`;
- parses archive contents with `ZipStore` and `@mrtdown/fs`, verifies any
  advertised scheduled timetable against the same canonical archive and admits
  it to append-only retention, then projects that version into the departure index;
- inserts parsed entities into `*_next` staging tables;
- promotes changed rows into live tables;
- deletes orphans after dependents are synchronized;
- finalizes metadata for the completed pull.

## Scheduled timetable storage

The `scheduled_timetables` table stores versioned bundles separately from
canonical entities. Each row retains the seven original files and an import
receipt. Constraints allow one baseline, one successor per predecessor and
consistent receipt links. `retainScheduledTimetable` appends internally verified
bundles under a transaction lock, validates retained lineage with the shared
history validator, and requires explicit source-order review. Retries preserve
the original seven files and receipt. Callers must authenticate the Pages entry
and verify all seven files before calling; retention does not grant release or
mapping approval or establish canonical compatibility. The canonical pull now
uses this retention path; public arrivals do not read these bundles.

`readScheduledTimetableArchive` prepares that trusted input from `ZipStore`.
It uses the optional `scheduledTimetable` entry supplied by the configured Pages
root manifest, never an entry self-advertised inside the ZIP. An absent entry
returns `null` without reading timetable files. An advertised bundle must pass
the shared `@mrtdown/fs` artifact, release report and mapping/review binding
checks for all seven exact `data/scheduled-timetable/` paths; missing, invalid or
duplicate files fail closed. The adapter preserves original bytes without JSON
reserialization, bypasses the inflated ZIP cache and returns no decoded timetable.
This verifies the published release/mapping bindings, not source-order admission,
compatibility with the site's canonical data or eligibility to serve departures.

`POST /internal/api/tasks/pull` accepts an empty body or `{}` as before. To admit
a new artifact, explicitly supply `{ "sourceReview": <review> }` using the
shared `ScheduledTimetableSourceReviewSchema`: a `scheduled-timetable-source-review`
record with `schemaVersion: 1`, a `decision` (`baseline`, `successor`, `correction`
or `resolve-version-conflict`), exact `predecessor` and `successor` identities
(`manifestSha256` and source `snapshotSha256`), `reviewer`, `reviewedAt` and
`reason`. Only a baseline has a null predecessor. The authenticated task trigger
validates and forwards this record; signed direct workflow requests validate the
same contract. No review is inferred from release approval, archive contents,
opaque provider versions or the import clock. Unknown request fields are rejected.

The pull persists the configured data URL, trusted manifest and an import
instant in its manifest step. Its parse step downloads the archive from that
same root, verifies all seven files against the persisted entry, checks
canonical compatibility, calls retention and projects the admitted version
before truncating or inserting canonical staging data. The shared `@mrtdown/fs`
validator checks topology identity, references, platforms/boarding, ordered
service paths/revisions and active source service dates. A private temporary
directory bridges its filesystem API using only operators, lines, stations and
services from this ZIP. Those files must match the trusted root manifest's
complete domain inventories and hashes of schema-parsed JSON. This same private
snapshot stays immutable through retention and projection, then is removed on
success or failure. Timetable bytes stay in memory, with no second archive
download. Retries reverify downloaded bytes against that entry; an upstream
replacement cannot silently substitute a different bundle. Bundle bytes stay
inside the parse step and PostgreSQL, never in workflow step outputs. If the
upstream archive has changed, retry after restoring that bundle or start a new
pull against the new root manifest with its exact review.

New artifacts without matching source-order review fail with explicit retention
blockers and never reach projection. Rejection preserves retained history and
leaves staging and the last successful fingerprint untouched. Already-retained
artifacts need no new review and preserve their first receipt, but still undergo
compatibility validation against this pull's canonical archive. A later
projection or canonical staging failure can leave an admitted bundle retained;
its receipt records source admission only, and retrying does not rewrite it.
Projection failure prevents canonical staging and successful fingerprint
recording. The existing workflow lease and failure cleanup still apply.

Retention does not establish eligibility to serve departures. Compatibility is
checked against the incoming snapshot, not live database entities. Passenger
departure queries/API/UI and publication remain separate gates. Real mapping,
source and release reviews remain explicit upstream/operator work; this integration grants
none automatically and does not implement rollback serving.

To exercise the migration locally, set `TEST_TIMETABLE_DATABASE_URL` to the
existing local development database URL when running `npm run verify`. The test
creates and removes its own schema and applies the migration only there. It
does not migrate application tables or require another database service. Without
that variable, the PostgreSQL scenario is skipped.

### Indexed scheduled departure storage foundation

Four derived tables prepare indexed reads without parsing the retained timetable
body on each request. The internal `projectScheduledTimetable` builder writes
these tables during the canonical pull; passenger reads remain separate work.

- `scheduled_departure_projections` identifies one retained manifest and projector
  algorithm version. It records the canonical topology fingerprint/version, feed
  bounds and maximum departure offset across **all source stops**, including
  non-boardable stops. These support the shared window helper's candidate service
  dates, including overnight offsets. The manifest FK preserves access to source
  capture, correction, retrieval and review provenance; those fields are not copied
  onto every occurrence. Manifest digests and projector versions are identities,
  not source ordering. Retained receipt lineage remains authoritative for ordering.
- `scheduled_departure_days` records every feed date, including zero-active-trip
  dates, with whole-source active and unassigned-active trip counts. Missing dates
  are unavailable; zero occurrence rows never establish date coverage. An
  unassigned active trip anywhere in the source blocks that date conservatively,
  matching `selectRetainedScheduledTimetable`.
- `scheduled_departure_scopes` records each date's covered station, line, service
  and destination, with the union of platform alternatives. Coverage follows the
  shared selector's used patterns and active canonical revisions, including
  non-final station occurrences, independently of active trip assignments that
  day. It is not inferred from departure rows; an optional platform must belong
  to this coverage as well as each returned occurrence's alternatives.
- `scheduled_departure_occurrences` preserves boardable occurrences with a
  downstream alighting stop, including untimed candidates. Provider IDs and stop
  sequences remain strings; `occurrence_index` preserves source order for ties
  without numeric conversion of opaque sequences. Original Singapore service
  dates and bigint offsets retain times beyond 24:00 alongside resolved instants.
  `timepoint` preserves exact/approximate precision; nullable seconds/instant pairs
  preserve missing timing. Non-boardable and terminal occurrences stay in the
  archive. Scope foreign keys prevent rows belonging to another date or scope.

`projectScheduledTimetable` requires an exact retained manifest digest, its
supported algorithm version (currently 1), and an independently trusted canonical
snapshot directory that the caller keeps immutable throughout the call. It
rechecks retained metadata lineage, all seven files' artifact/release/mapping
bindings and canonical compatibility using the shared validators. Retention alone
does not prove compatibility with this snapshot or the live database. Only the
selected timetable body is loaded; the existing bundle and canonical validators
each decode that version, while historical lineage reads metadata only.

The builder uses shared calendar and canonical trip/date resolution helpers. Its
coverage follows the shared retained selector's used patterns and active revisions;
boardable rows must belong to that coverage and its platform alternatives. It
streams dates and resolved trips into batches of at most 500 occurrences, keeping
untimed candidates and never collecting the date-expanded timetable in memory.
The parse step invokes it only for the currently advertised, validated and admitted
manifest, using the same archive snapshot. GTFS-free pulls do no projection work.
Historical projections are preserved; the pull does not backfill retained history.
Projection adds no archive download or large workflow output.

A retained-parent row lock serializes concurrent builds, including the first
build. Every same-identity retry revalidates and rebuilds; a completion timestamp
alone never bypasses validation or proves existing rows complete. The builder
invalidates completion before a savepoint, replaces only this projection's derived
rows and publishes completion in the same transaction as all materialization.
On a build failure the savepoint rolls back partial writes and the outer transaction
commits the invalidation before reporting the error. Existing derived rows can
remain hidden behind null completion until a successful retry; unrelated manifests
and algorithm versions are untouched. Completion certifies materialization only,
not complete mapping, upstream approval or serving eligibility.

Future readers must require the expected projector version, completed state and
current canonical topology fingerprint/version before selection. They must use
explicit day/scope coverage and source lineage, count selected dates' untimed
boardable candidates before filtering known instants, and retain the shared
selector's conservative fallback/completeness semantics. The occurrence index
supports equality on projection/date/exact scope followed by an instant range
(or null timing); platform membership filters that bounded set. Primary keys
index projection identity, dates and scopes. Canonical IDs deliberately have no
FKs to mutable live entities, so canonical promotion cannot erase retained history.
Deleting a projection cascades only through its derived rows; no deletion cascades
into `scheduled_timetables`. Real mapping, source and release approvals and
passenger query/API/UI remain separate work and gates.

### Internal indexed date and scope selection

`withSelectedScheduledTimetable` selects one completed, supported projection for
one service date and exact canonical station/line/service/destination scope,
including optional platform coverage. It reads retained manifests and receipts
through the shared metadata-only history validator and follows that validated
chain newest first. Invalid lineage throws; it never reconstructs ordering from
provider versions, hashes or import times. It checks artifact bounds, both
manifest and projection topology identities, projection feed bounds, explicit
day/scope coverage and whole-source unassigned-active counts, falling back to an
older eligible version. A covered zero-active date can be selected; missing rows
cannot establish coverage. No timetable body or occurrence rows are loaded.

The helper uses `withScheduledTimetableSnapshot`, which owns a read-only
repeatable-read transaction and loads topology, validated history and projection
metadata once for all selections and consumer reads. Its default
`readLiveScheduleTopology(tx)` loader reconstructs the shared canonical v1 projection
from live normalized tables in that snapshot. An optional trusted internal
`readCanonicalTopology(tx)` override remains for focused tests; it must establish
that same canonical state, never candidate topology or an external fingerprint.
The consumer callback
receives both selection and transaction so a later indexed query can read the
same snapshot through concurrent canonical changes or projection rebuilds. A
projection ID retained after the callback ends is provenance, not a reusable
eligibility token. Selected version/receipt provenance, counts, platform coverage
and per-candidate reasons distinguish unavailable or incomplete coverage from a
valid empty date. Reviewed scoped rollback policy, passenger API/UI, and actual
mapping/source/release approval and publication remain separate gates.

### Private indexed departure windows

`queryIndexedScheduledDepartures` validates a strict scope, ordered instants, a
window of at most 24 hours and an optional positive integer limit before opening
the database snapshot. Shared core window/service-date helpers enumerate Singapore
service dates using completed, supported, topology-compatible projection metadata's
maximum source offset, including 24+ departures. No timetable body is hydrated.
Internal callers provide scope/window/limit and use the live loader by default.

The loader uses eleven explicit-column queries for operators, lines, line operators
and services, stations, codes, platforms and platform services, services, revisions
and ordered paths. It preserves repeated visits, nullable operator dates and
revision ends, absent boarding statuses and empty service lists. JSON property and
array ordering match `@mrtdown/fs`'s `scheduleTopologyProjection` v1; the full-entity
projector would require unrelated geography, names and operating hours. Empty
entity domains, inconsistent relationships, null revision starts or ambiguous/gapped
path indices throw before history or departure reads. No candidate topology,
retained body, filesystem snapshot, network read or independent cache is used.

Repeatable read alone can observe an intermediate multi-domain promotion. The first
parent-upsert transaction clears `canonical_topology_promotion_complete_v1` and
the successful manifest fingerprint in metadata before changing live entities.
A failed promotion therefore cannot skip recovery if the source returns to the
previous successful manifest. Finalization restores the promotion marker in the same
transaction as staging cleanup and the pull timestamp, after all domain promotion
and orphan cleanup, only when the persisted parse result confirms every canonical
line was staged. Missing confirmation (including older resumed parse results)
also leaves the marker absent. The loader checks this marker in its own snapshot and throws
while absent, including after a failed pull whose lease has been released or
expired. It still computes topology from live rows; the marker stores no candidate
fingerprint and grants no timetable approval. Pipeline version 5 introduced this
guard; version 6 forces a full pull that also retains lines with unknown dates/hours
on existing installations. This certifies canonical promotion only; later rebuilds of derived data, cache publication and successful pull
fingerprint recording retain their existing ordering.

Canonical lines with a null start date or absent operating hours are retained in
both staging and live tables, including their operator and service relationships.
Database null hours map back to the canonical optional field; null start dates
remain unknown rather than being inferred from service branches. Complete staging
can therefore certify promotion without narrowing the shared topology projection.
The staged line count and explicit completeness confirmation remain required;
missing confirmation from an older resumed parse result still fails closed.

Readers that require an operating window skip unknown start dates/hours. They do
not mark these lines operational or invent hours, dates, uptime or frequency
estimates. Line summaries distinguish unknown service information from a known
future opening or known off hours; quick facts display unknown hours. Operational
facts retain issue counts but contribute no service-window seconds or clipped
downtime intervals when the window is unknown. SQL predicates that require a known
start date continue to exclude unknown starts conservatively. This supports valid
canonical inputs; it does not imply current production lines are missing fields.

Each candidate date independently uses the same conservative selector and receipt
lineage, allowing date-specific fallback. SQL restricts occurrence reads to the
selected projection/date, exact canonical scope, half-open instant range and
optional platform membership. All timed rows within those bounds are merged by
instant/date/trip/source occurrence order before applying the result limit.
A separate SQL count includes every relevant boardable untimed row on each selected
service date, regardless of the instant range or result limit; no time is inferred.
Source provenance, scheduled basis, exact/approximate precision, platform
alternatives and opaque provider IDs/stop sequences survive the read.

The result includes per-date selections/attempt reasons, untimed count and
`complete`. Missing dates/scopes and whole-source mapping gaps are unavailable,
while a selected zero-active date can establish an authoritative empty schedule.
Missing/incomplete/incompatible projections for current-topology retained artifacts
also appear in `unavailableProjections` and force incomplete coverage: their unknown
maximum offsets could hide earlier service dates even when a fallback is selected.
Topology, candidate enumeration, every selection, counts and departures share one
read-only repeatable-read transaction across concurrent canonical promotion and
projection rebuilds. Returned projection IDs are provenance only after it closes.
This private query grants no serving approval and adds no passenger API/UI, scoped
rollback policy, real mapping/source/release approval or public publication.

### Internal scheduled station-arrivals adapter

`buildScheduledStationArrivalLines` purely maps one validated
`queryIndexedScheduledDepartures` result into line groups and service/destination
timings. Its `basis: 'scheduled'` contract is separate from estimated arrivals:
departures add `time` as an alias of `departureInstant` and retain all original
scheduled fields, including exact/approximate precision, original service date,
opaque provider IDs/stop sequence, revision, manifest/source snapshot hashes,
retrieval time and correction revision. Manifest hash, service date, provider trip
ID and stop sequence distinguish occurrence/version identity. `timepoint: 0`
remains approximate scheduled time. No confidence, headway, crowd phase anchor or
first/last service-day bounds are inferred from the returned window.

Each call covers one exact station/line/service/destination scope. Timing groups
use the full set of alternative platform IDs; one departure appears once, even
when several platforms are possible. Group order follows the first occurrence
and departures retain query order within each group. Display names, destination
code and platform labels must come from independently trusted canonical metadata
for that exact scope, not a destination inferred from a latest revision. Labels
only decorate platform IDs (missing labels display the ID); they grant no eligibility.

The adapter preserves `scope`, `window`, `complete`, per-date selections/attempts,
retained receipts, unavailable projection reasons and untimed counts, including
when timing groups are empty. `complete` describes query coverage, not whether a
limited result exhausts the window or whether serving is approved. Complete empty
coverage remains distinct from incomplete/unavailable coverage; an empty group
list alone cannot trigger frequency fallback. The private source policy below
consumes this evidence; API/UI selection and crowd overlays remain follow-ups. Reviewed
scoped rollback and its shared package release remain serving gates; the current
core alpha.39/fs alpha.43 packages lack those contracts. Actual mapping/source/
release approvals and publication also remain separate. Existing frequency/crowd
consumers are unchanged; this adapter is not selected by current page responses.

### Private station-arrivals source policy

`selectStationArrivalSource` consumes the validated scheduled adapter result and
an optional existing frequency timing for one independently covered canonical
branch. Complete coverage is authoritative, including empty or limited results
and approximate scheduled times. Untimed rows keep their scheduled basis and
incomplete status. Neither departure counts nor timing-group emptiness establish
a coverage gap.

Only unselected dates with no retained artifact (no attempts), or exclusively
`outside-feed-range`, `scope-not-covered` or `mapping-coverage-gap` attempts permit
frequency fallback. Any unavailable projection or other unselected-date reason
returns `unavailable`, retaining the scheduled object as evidence. Projection
absence/incompleteness/metadata mismatch, missing indexed dates and topology
uncertainty are failures, not ordinary gaps. Query exceptions such as invalid
lineage or incomplete canonical promotion propagate before this policy; callers
must not convert them or rejected rollbacks into a no-artifact result.

Partial multi-date coverage keeps usable scheduled results and `complete: false`.
Whole-window frequency estimates cannot safely fill its gaps without a separate
interval algorithm, so this policy never merges them. Every decision retains the
original scheduled object, including ordering, provenance and all diagnostics.

The frequency candidate must come from independently known canonical service
coverage, not a synthesized empty timing or names matched to scheduled results.
Its station ID and timing's line/service/destination IDs must match; its declared
window must match by instant and every supplied estimate must lie within that
half-open window. Callers must bind that window to the estimate's actual query
context. Platform-specific fallback is unavailable because frequency timings
carry platform labels, not canonical platform IDs. Frequency departures retain
their existing basis, confidence, headways and crowd evidence. Crowd reports never
shift scheduled times here. This internal decision grants no serving approval;
public API/UI, scheduled crowd overlay, reviewed rollback/shared package release,
actual mapping/source/release approvals and publication remain separate gates.

### Private exact-scope station-arrivals reader

`readStationArrivalSource` composes the indexed query, scheduled adapter and source
policy for one canonical station/line/service/destination (optional platform).
`referenceInstant` is the single request clock and half-open window start;
`endInstant` and optional positive `limit` use the indexed query's existing
validation, including its 24-hour maximum. Public station pages/APIs remain unchanged.

`withIndexedScheduledDepartures` keeps the reader callback inside the query's
read-only repeatable-read transaction. Canonical topology, display names, destination
code, platform labels, revision/profile, station first/last times, holidays and
current crowd reports therefore share the eligibility snapshot. Destination display
comes from the requested canonical destination and its line code at the reference
date; it is never inferred from a different revision or matched by name. Query and
promotion/lineage failures propagate. Complete empty schedules remain authoritative;
partial schedules retain their diagnostics and never merge whole-window estimates.

Only the existing policy's documented gaps reach the current
`getEstimatedStationArrivalTimings` estimator and crowd-report reader.
Fallback requires the selected active canonical revision's actual path to contain
the station and end at the requested destination. Because the existing estimator
uses one profile for yesterday/today/tomorrow, fallback conservatively declines
revision transitions across those dates. It returns at most the estimator's next two
estimates, filters them to the declared window and applies the optional limit; an
empty result produces no candidate. Platform-specific fallback remains unavailable.
Crowd phase anchors affect frequency estimates only. This private reader grants no
serving approval: passenger API/UI wiring, scheduled crowd overlay, reviewed scoped
rollback and its shared package release, real source/mapping/release approvals and
publication remain prerequisites. Published core alpha.39/fs alpha.43 still lack
the rollback contracts.

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

Each pull first compares a stable fingerprint of the canonical manifest's
read-model inputs and complete optional timetable entry with the fingerprint
recorded after the last fully successful pull. A timetable-only addition,
replacement, release change or removal therefore triggers a full pull. When the
fingerprint matches, the workflow exits before downloading the archive,
staging data, rebuilding facts and snapshots, or purging the public cache.
The fingerprint deliberately excludes `generatedAt`, which is publication
metadata rather than a data change. Bump the pull pipeline version in
`app/workflows/pull/helpers/manifestFingerprint.ts` when a pull or derived-data
code change requires one full rebuild without an upstream manifest change.
Version 4 added departure projection to the pull. Version 5 initialized the
completed canonical promotion marker for live topology reads. Version 6 forces
one full pull to retain previously omitted lines with unknown start dates or hours,
including projection of an already-retained advertised artifact without a new
source review. It does not backfill other historical artifacts. The
fingerprint is recorded only after retention, timetable projection, canonical
promotion, derived rebuilds and cache publication succeed. Scheduled requests
still carry no review: an unseen timetable remains blocked until an operator
submits its source review.

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

The sync only manages its three deterministic schedule IDs; it does not delete
other QStash schedules. Cron expressions use UTC, matching the former
Cloudflare schedules.

## Operational Facts

Daily fact rebuilds write aggregate service, downtime, and issue counts to
`line_day_facts`. They also write each issue interval clipped to the applicable
line service window to `line_day_issue_intervals`. The interval rows are derived,
rebuildable data used when a read needs exact placement or overlapping impact
lanes rather than aggregate durations alone. The same rebuild refreshes
`station_issue_facts`, an exact issue-to-station projection used for compact
station status and latest-disruption reads without reconstructing impact-event
history on a public request.

After operational facts, the canonical pull refreshes the persisted statistics
and sitemap snapshots before purging the public edge-cache tag. Statistics and
sitemap requests require those successfully rebuilt projections in every
environment. Missing or invalid snapshots fail with instructions to apply
migrations and run the canonical pull or authenticated facts rebuild.

## Crowd Report Dispatch

Before dispatch, reports within 10 minutes of an existing observation join the
same incident when they identify the same line set, even if they name different
stations. Reports without line context require the same station set. Unknown
effects and unspecified directions can join specific reports; conflicting known
effects or directions stay separate. The cluster retains the union of reported
stations and adopts a known effect when its original effect was unknown.
The evidence page and dispatch payload use the latest specified direction, so
an unspecified direction on a newer report does not erase an earlier one.
Recent corroborating reports extend the matching window while keeping a direct
reference to the original report. Dispatched clusters remain closed, and
existing clusters are not retroactively merged.

Accepted crowdsourced reports and accepted report clusters trigger a
best-effort dispatch attempt as soon as the submission transaction commits. The
submission response does not wait for GitHub, and accepted rows stay pending if
that attempt cannot complete. The `/internal/api/tasks/crowd-report-dispatch`
endpoint builds an
`@mrtdown/ingest-contracts` `crowd-report` payload, posts it to the
`mrtdown-data` `repository_dispatch` ingest workflow, and records dispatch
success or failure on the site-local report rows.

Dispatch converts Postgres timestamp strings to the ISO format required by the
ingest contract. A cluster's exported report count comes from the same eligible
report rows as its payload's report IDs, rather than a separate count query.

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

Handled dispatch endpoint failures emit a Sentry event named `Crowd report
dispatch request failed`, tagged `component:crowd-report-dispatch`, with the HTTP
status and failure reason. The `crowd_report_dispatch` context includes QStash
message and schedule IDs, the Cloudflare Ray ID, a safe `headerFormat` enum
(including a literal redaction placeholder), and sanitized validation codes and
field paths. The enum's key avoids authorization-related names that Sentry scrubs.
Credentials, signatures, raw bodies, and parser error text are excluded. These
events cover 400/401 request rejections, 503 configuration failures, and 207
dispatch failures; unhandled exceptions continue through the existing Sentry
server instrumentation.

Immediate dispatch after a submission also reports missing configuration, failed
candidate counts, and caught background exceptions to Sentry with
`component:crowd-report-dispatch` and `trigger:submission`. Exception stacks and
sanitized ingest validation paths are retained; original error messages and the
submitting request's body, headers, and breadcrumbs are excluded. Reporting does
not make the submission wait for dispatch or remove the scheduled retry backstop.

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

## Staging Tables

Staging tables are named with a `_next` suffix. They are the durable handoff between workflow steps and avoid returning large parsed payloads between Upstash Workflow steps.

## Live Reads

Server functions call feature modules under `app/util/dbQueries`, which read
normalized live tables through the shared dataset layer and return the
source-owned shapes in `app/types.ts`.
