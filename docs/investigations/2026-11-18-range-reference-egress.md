# Reduce static reference reads for range pages

> Dated investigation and local handoff. Its pending tasks, switches and SQL
> descriptions reflect the recorded revision, not current deployment state.
> Use the [maintained guide](../operations/edge-caching.md) for current operation and the
> [sleep plan](../plans/active/neon-sleep.md) for remaining acceptance.

Implemented opt-in caching for seven useful range-reference sets, with narrower
SQL projections and omitted unused lookups. Holidays and live issues remain in
Postgres. Projection cleanup reduces the current static-input JSON proxy from
464,187 to 307,362 bytes (33.8%); a reference hit also avoids about 305 KB of the
remaining proxy. These are sizing estimates, not measured production savings.

The [reference-cache runbook](../operations/edge-caching.md#range-reference-inputs)
owns configuration, seeding, publication and rollback. Production settings are
unchanged; staging validation and production measurement remain.

## Evidence and limits

Source review started at clean revision
`ad8595642e9c731f459acda9d70a69500aa7b264`. The supplied production handoff
identified `083cf935` (PR #312), Fly release 84, with Navigation, completed
Issue Profiles and service paths enabled. The
[Redis plan](../plans/completed/redis-page-profile-cache.md) owns that rollout;
the [egress plan](../plans/completed/production-egress-reduction.md) owns wider
attribution.

The supplied matched November 18 versus November 17 midnight–9 p.m. PT windows
showed responses 18,971 → 13,289, Neon egress 4,079,482,898 → 3,454,662,459 bytes,
and normalized egress 215.0 → 260.0 decimal KB/response (+20.9%). Median latency
was 124.0 → 154.9 ms; p95 was 943.8 → 960.7 ms; compute was broadly unchanged.
This establishes neither aggregate cache benefit nor causal regression. Route
mix and Cloudflare cache-status attribution are unavailable. Shared Redis totals
of about 29K commands, 267 MB, $0.06 and 8 MB stored have different or unlabeled
accounting boundaries, so they cannot establish incremental cost.

The supplied natural-traffic SQL delta covers `2026-11-19T05:15:09.615Z`
through `05:16:04.851Z` (55.236 seconds). Full stations, landmarks, codes,
revisions and relationship queries each ran three times; holidays ran four
times. These shared query shapes identify current activity, not range-request
counts or daily rates. Statistics reset was `2026-10-14T12:58:15.856Z`,
rechecked through Neon at `2026-11-19T05:21:58.957Z`; cumulative rankings include
old releases. No production counters were reset.

Temporary evidence is `/tmp/mrtdown-neon-cache-triage.json`, its `snapshot-a`
and `snapshot-b` files, and
`/tmp/mrtdown-service-path-measurement-summary.json`. The supplied Node JSON
proxies were stations 171,071 bytes, landmarks 108,935, station-landmarks 34,372,
revisions 47,991 and holidays 15,475. The existing path entry contains 2,088 rows
in 263,955 published bytes.

An aggregate-only query on project `crimson-meadow-37625546`, branch
`br-flat-poetry-a16o0cs4`, database `mrtdown_db` compared the projections below.
It summed `octet_length(json_build_object(<selected fields>)::text)` over rows,
including Postgres JSON whitespace and excluding array framing. This differs
from Node encoding, especially timestamps: compare columns within this table,
not across methods. Neither measures billed wire bytes. The query and results
are in `/tmp/mrtdown-range-reference-sizing.sql` and the corresponding `.json`.

| Input | Rows | Current row-JSON bytes | Proposed row-JSON bytes |
| --- | ---: | ---: | ---: |
| Stations | 233 | 176,430 | 176,430 |
| Station codes | 288 | 39,962 | 39,962 |
| Station-landmarks | 617 | 37,457 | 37,457 |
| Service revisions | 124 | 50,471 | 35,839 |
| Services | 38 | 12,442 | 9,516 |
| Lines | 11 | 5,884 | 4,828 |
| Line operators | 10 | 1,708 | 938 |
| Landmarks | 397 | 112,111 | 0 |
| Towns | 46 | 9,741 | 0 |
| Operators | 3 | 886 | 0 |
| Metadata | 5 | 476 | 0 |
| Public holidays | 104 | 16,619 | 2,392 |
| **Total, excluding paths** | **1,976** | **464,187** | **307,362** |

Omitted tables account for 123,214 bytes of savings; narrower projections save
another 33,611. Seven cacheable row sets remain: 1,321 rows and 304,970 row-JSON
bytes, excluding holidays and paths. The table sizes are current observations,
not hard SQL bounds.

## Consumer and query audit

[getIssuesOverlappingRange](../../app/util/dbQueries/issueRange.ts) scopes issue
IDs with the latest-period-event CTE. It still needs network references when
no issues match. Its consumers require different coverage:

| Consumer | Required references |
| --- | --- |
| [Overview/system map](../../app/util/dbQueries/overview.ts) | All line summaries and operating hours; holiday day types; affected/community-signal stations and membership lines; every station name for the map. |
| [History year/month/day and issues-day](../../app/util/dbQueries/history.ts) | Affected stations, historical whole-service stations and membership lines, retaining all existing fields in returned station/line objects. |
| [Weekly report](../../app/util/weeklyReport.functions.ts) | All lines and current-week station context. Its separate sitemap snapshot read is unchanged. |

None selects operator, town or landmark dictionaries through
[selectIncludedEntities](../../app/util/dbQueries/includedEntities.ts), or reads
dataset metadata. Omitting those internal lookups preserves public responses.

The five egress patterns were assessed:

| Pattern | Finding and action |
| --- | --- |
| Unused columns | Drop line/service/line-operator hashes, line end date, revision operating hours and holiday metadata from range projections. |
| Repeated static reads | Cache the seven useful row sets by completed canonical generation. |
| Boundedness | Whole network references and historical revisions are required. Arbitrary pagination would change responses; cap cache bytes and retain SQL fallback. |
| Application aggregation | Maps, memberships and dated revision selection still need the selected content. SQL aggregation would not remove that transfer. |
| Join duplication | Existing separate-table reads avoid multiplying wide station rows across paths/revisions/landmarks. Retain the distinct final-issue-ID CTE. |

Keep every selected station, code and station-landmark field: coordinates,
first/last trains, town IDs and landmark IDs survive in returned station objects.
Codes also produce fallback memberships. Revision dates, IDs and update
timestamps control historical/future selection; estimated frequency remains in
the shared branch output.

## Implementation decisions

- [Range projections](../../app/util/dbQueries/rangeReferences.ts) supply seven
  complete projected row sets to `buildDataset` through named reference inputs.
  This is separate from `DatasetStaticScope`: empty scope IDs would incorrectly
  remove required lines, codes and revisions. Other entity/maintenance readers
  retain their defaults; this builder's holiday read is date-only.
- [Generation storage](../../app/util/generationCache.server.ts) owns bounded
  Redis reads, isolated process memos and immutable writes for both caches.
  [References](../../app/util/rangeReferenceCache.server.ts) and
  [paths](../../app/util/servicePathCache.server.ts) retain their schemas, flags,
  snapshot reads, publication preparation and diagnostics.
- SQL supplies the generation once per range transaction whenever either reader
  is enabled. All fallback reads share that read-only repeatable-read snapshot.
  Requests never fill entries. Both flags work independently.
- Reference retries compare table-row sets while preserving the first
  publication's membership/landmark input order. Revision timestamps normalize
  to ISO; branches and memberships are assembled at request time.
- [Holiday sync](../../app/workflows/publicHolidays/index.ts), including manual
  refresh, changes dates independently of canonical pulls. Leaving dates in SQL
  makes the next snapshot current without TTL waits or reference invalidation.
  The [manual facts rebuild](../../app/routes/internal.api.tasks.facts.ts) changes
  facts/statistics/sitemap, not references or generation; its separate edge-purge
  behavior is unchanged.
- Canonical reference repairs must mark updating before writes, complete a new
  generation, republish and purge. A same-generation seed cannot replace changed
  contents. The runbook covers every generation-changing pull/seed path.
- Issue/event/evidence data remains live. Navigation's compact payload and
  completed Issue Profiles cannot replace these references. Arrival topology,
  broad profile path reads and sitemap caching remain separate work.

The initial recommendation was projection cleanup before caching. On November
18 PT, the user authorized both together. A cache of the complete issue/network
dataset remains outside this design.

## Validation and next step

- `TEST_TIMETABLE_DATABASE_URL=<local PostGIS> TZ=UTC npm run verify` passed:
  99 files, 692 tests, none skipped. Isolated schemas preserved existing data.
  Coverage includes public-output parity, both flags, missing/invalid/oversize
  entries, SQL fallback, holiday sync/manual facts rebuild, historical/facility
  scopes, date boundaries and concurrent issue/reference/path publication.
- `npm run build` passed. A compiled-server smoke check with real local Valkey
  matched SQL for Redis and process-memory reads: zero reference/path queries,
  with one holiday and one generation SQL read per request. The seven-row
  fixture serialized to 1,154 bytes; that proves transport, not production size.
  Temporary schema and owned keys were removed.
- Refactoring retained the cache keys, payload format, limits, flags and
  fallback semantics. Existing contract tests cover the shared storage helper.
  No production deployment, flags, schedules, seed or purge changed.

Next, validate staging through the runbook. Hits must execute zero SQL reads of
the seven reference sets, with live issue/holiday SQL retained. SQL fallback
must use eight static query sets instead of twelve, excluding paths and the
generation lookup, and the matched static row-JSON proxy should drop at least
30% (estimate 33.8%).

A separately authorized production enablement needs matched complete-hour Neon
egress, Fly response/latency and Redis usage windows, exact rollout boundaries,
source/fallback observations and any available route/cache attribution. Do not
infer aggregate billing savings or latency improvement from the sizing proxy.
No suspension target applies while live SQL remains.
