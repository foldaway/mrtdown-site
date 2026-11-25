# Reuse validated station-arrival topology

Implemented a bounded process memo of the complete schedule-topology projection,
with its digest attested by canonical promotion in Postgres. Timetable selection
and departures stay in the existing read-only repeatable-read transaction.
The reader is opt-in and defaults to disabled; production rollout is pending.

Start with local reuse and SQL cold loading. It removes all 11 topology-table
reads on a warm hit without adding Redis publication or a second shared payload.
Measure cold-load frequency before considering a shared topology cache. The
remaining static inputs for range pages are a separate workstream.

## Evidence and expected benefit

The November 18 investigation used checkout `ad859564` and production evidence
for `083cf935` (PR #312, Fly release 84). The supplied read-only counter snapshots
span `2026-11-19T05:15:09.615Z`–`05:16:04.851Z` (November 18 PT), 55.236 seconds,
with `stats_reset = 2026-10-14T12:58:15.856Z` unchanged.

- Arrival path query `9017269580652711492` selects `service_id` first and orders
  by `path_index`. Calls increased from 15,349 to 15,351 and rows from 32,048,712
  to 32,052,888: two full reads of 2,088 paths. This differs from the range-page
  path query served by the existing cache.
- The matching 11 topology query shapes each ran twice, totaling 3,812 rows per
  full read. Paths alone measured 261,804 selected-row JSON bytes per full read.
  Other sizing results used broader columns and cannot size the arrival topology.
- The [station hook](../../app/routes/{-$lang}/stations/$stationId/components/useStationArrivals.ts)
  refreshes every 30 seconds. Its [refresh session](../../app/routes/{-$lang}/stations/$stationId/components/stationArrivalRefresh.ts)
  fetches each distinct branch, with two workers and no overlapping refresh cycle.
  One open station can therefore multiply full topology reads.

The sample establishes current activity, not daily rates or HTTP request counts.
Cumulative rankings include old releases. JSON sizes are transfer proxies, not
billed Neon wire bytes. Raw local evidence is in
`/tmp/mrtdown-neon-cache-triage.json` and its `-snapshot-a.json` and
`-snapshot-b.json` inputs; retain the observations above if those temporary files
expire. No statistics were reset for this investigation.

For context, the supplied service-path comparison covers matched 21-hour windows:
November 17 and 18, midnight–9 p.m. PT. App responses fell 18,971 → 13,289;
Neon egress per response rose 215.0 → 260.0 KB (+20.9%); p50 rose
124.0 → 154.9 ms and p95 943.8 → 960.7 ms. This establishes neither aggregate
benefit nor a causal regression. Route mix and Cloudflare cache-status attribution
are unavailable. Redis totals (~29K commands, 267 MB, $0.06, 8 MB stored) cover
the shared database with different/unlabeled accounting boundaries. The source is
`/tmp/mrtdown-service-path-measurement-summary.json`. Retaining the functioning
service-path reader provisionally does not validate an arrival-cache expansion.

For each warm topology hit, expect to avoid 11 bulk SELECTs and 3,812 transferred
rows at this dataset size, including the 261,804-byte path proxy. A small SQL
identity read remains. Cold loads still pay the current full read. For N reads
and C cold/bypass loads, the path-only avoided proxy is approximately
`(N - C) × 261,804` bytes, before metadata overhead. This is a workload model,
not a forecast of billed savings. Auto-stops, restarts, and concurrent first
requests can make C larger than the number of Machines.

## Current consistency contract

The [data-pipeline guide](../architecture/data-pipeline.md#departure-selection)
owns selection semantics; the [API guide](../api/station-arrivals-v2.md) owns
the public result contract.

1. [Archive import](../../app/workflows/pull/helpers/importScheduledTimetableArchive.ts)
   validates canonical compatibility, admits a retained release, and projects it
   **before** canonical promotion. A receipt or completed projection cannot prove
   that its topology is the current live network.
2. [Promotion](../../app/workflows/pull/helpers/stagingSync.ts) spans transactions.
   Its first live upsert marks page profiles `updating` and clears both
   `canonical_topology_promotion_complete_v1` and the successful pull fingerprint
   in the same commit. Finalization writes `manifest_last_pulled_at` and restores
   the promotion marker to `1` only with full canonical-topology confirmation.
   A stable SQL snapshot alone does not make a partial promotion safe.
3. [Pull publication](../../app/workflows/pull/index.ts) follows finalization,
   facts, statistics, and sitemap rebuilds. It marks the page-profile generation
   complete, publishes caches, purges the edge, then records the successful
   [manifest fingerprint](../../app/workflows/pull/helpers/manifestFingerprint.ts).
   That fingerprint represents pull inputs and pipeline version, not the schedule
   projection's topology hash. A standalone Navigation seed can advance the
   page-profile generation without changing topology. Finalized arrivals can
   currently work before cache publication or successful fingerprint completion.
4. [The live loader](../../app/util/dbQueries/readLiveScheduleTopology.ts) requires
   the promotion marker, validates relationships and contiguous revision paths,
   and reconstructs `@mrtdown/fs` schedule-topology projection v1 with exact
   property/array ordering. Its hash covers more than paths: line/operator
   relationships, station codes, platform labels and boarding restrictions,
   service memberships, and revision validity also participate.
5. [The selector](../../app/util/dbQueries/withSelectedScheduledTimetable.ts)
   hashes that independently reconstructed object. It validates the entire
   [admitted predecessor chain](../../app/util/dbQueries/scheduledTimetableHistory.ts),
   including retained manifest bytes and reviews, before choosing newest-to-oldest
   for each service date. It compares both manifest and completed projection
   topology hashes/versions, projector version, feed range, day and scope coverage,
   and unassigned trips. Platform exceptions, loops, and reviewed rollback retain
   their existing checks.
6. [Window reads](../../app/util/dbQueries/queryIndexedScheduledDepartures.ts)
   consume selected projection IDs inside that same read-only repeatable-read
   transaction. They include overnight dates, untimed counts and unavailable
   projections, merge dates before limiting, and preserve authoritative empty
   results. [Display metadata](../../app/util/dbQueries/readStationArrivalSource.ts)
   also uses that transaction. The [API](../../app/routes/api.stations.$stationId.arrivals.v2.tsx)
   separately reads recent rider reports afterward and always returns `no-store`.

A request pinned before promotion may finish using the old coherent network and
departures. A request during partial promotion must still fail the promotion
gate. A request after finalization must use the new network, even before Redis
publication. A timetable correction or projection rebuild can change selection
without changing topology; it must remain visible to the next SQL snapshot.

## Options

| Option | Assessment |
| --- | --- |
| Reuse `service-paths:v1` directly | Its generation and structural validator do not attest the full live topology hash. It also omits the other ten inputs. Do not use it as arrival authority. |
| Use those cached paths while rebuilding everything else | Could become safe with an independent SQL-attested full topology digest, exact reconstruction and hash verification, with SQL fallback on disagreement. Adds Redis dependency and ordering conversion while retaining ten bulk reads; defer. |
| Dedicated complete topology memo | Recommended first tranche: preserves the existing selector input and removes all bulk topology reads on warm processes. Requires an explicit SQL digest binding and cold-load measurement. |
| Narrow SQL to the requested service/stations | Cannot produce the current whole-network hash. Requires an attested full hash plus a new scoped validation interface for loops, platform exceptions and display metadata. Reconsider if measured cold loads dominate. |

The existing [service-path cache](../../app/util/servicePathCache.server.ts) may
eventually provide transport, but its generation must never substitute for a
topology fingerprint or select a timetable. Keep its current range readers intact.

## Implementation

- [x] Finalization validates actual live topology and atomically commits its digest,
  projection/encoding versions, promotion token and exact last-pull timestamp.
  The first promotion write clears it. Existing metadata storage needs no migration.
- [x] One memo per database handle holds at most 1 MiB of encoded topology, keyed
  by digest and versions. Every hit requires the SQL snapshot's completed promotion
  and valid attestation. Cold/invalid/oversized cases use the original SQL loader.
- [x] Callers receive independent clones. Concurrent cold loads stay in their own
  transactions; a delayed fill cannot overwrite a later reader's entry.
- [x] Pipeline version 7 forces one full pull for unchanged inputs. Timetable pins,
  reviews, projection reuse, page-profile publication and holiday/facts behavior
  retain their existing rules.
- [x] The topology memo is always used when attested; attestation maintenance
  is unconditional. Source/bypass and sizing diagnostics support later measurement.
- [ ] Validate in staging, then measure a separately authorized production rollout.

The [data-pipeline guide](../architecture/data-pipeline.md#arrival-topology-reuse)
owns operation and rollback. The [memo reader](../../app/util/dbQueries/scheduleTopologyCache.ts)
and [promotion metadata](../../app/db/canonicalTopologyPromotion.ts) own the
implementation. The digest is a correctness boundary: every supported topology
writer must invalidate it. TTLs, receipts, the pull lease alone or a complete page
generation cannot repair a writer that bypasses this protocol.

## Focused acceptance and measurement

The existing [snapshot integration tests](../../app/util/dbQueries/queryIndexedScheduledDepartures.integration.test.ts)
and [combined pull tests](../../app/workflows/pull/reviewedTimetables.test.ts) cover:

- Byte-identical producer topology and SQL/warm-result parity for display metadata,
  overnight dates, empty/untimed coverage, platforms, loops and reviewed rollback.
- Zero bulk topology queries on warm reads, with fresh history, projection, coverage
  and departure queries. A page-profile-only generation change does not invalidate
  topology; a projection change remains visible with topology warm.
- Old-snapshot coherence across promotion, partial/failed promotion rejection,
  newly finalized topology before page-cache publication, and delayed fill ordering.
  Overlapping cold reads warm the memo before every pending load finishes.
  Changing a platform label rejects old timetable hashes even with unchanged paths.
- Cold handles, disabled reads, caller mutation, absent/malformed/unsupported/stale
  attestations, digest mismatch, size ceiling, invalid path ordering and damaged
  admission chains. Invalid finalization rolls back its marker and attestation.

API `no-store` and rider-report logic are unchanged and retain their existing tests.
No general measurement regression harness was added.

Before any later production rollout, record a longer natural-traffic baseline
with arrival request counts and these query-family deltas, reset timestamp,
Machine restarts and import windows. Do not reset statistics. Keep workflow
archive validation, projection builds and canonical promotion reads separate from
visitor-triggered topology loads; those bounded operations should remain SQL work.

Use staging fixed-clock parity and cold/warm query traces to accept correctness.
For a later production decision, compare complete matched windows with request
volume, topology hit/bypass rate, cold loads per process/promotion, latency and
errors. Target at least 90% fewer visitor topology rows per arrival request under
representative traffic; report cold-start sensitivity if that target is missed.
Then assess billed Neon egress alongside route mix, other live SQL and deployment
changes. Without attribution, report aggregate results as inconclusive. Record
actual memo bytes and any provider usage changes separately. Neon suspension is
not an acceptance condition.

If cold/bypass loads materially limit benefit, use that evidence to choose between
a content-addressed Redis representation validated against the same SQL attestation
and narrower SQL. Do not add either preemptively. A later rollout can disable only
this memo reader and return immediately to SQL; it needs no edge purge because
arrival responses remain uncached.

## Handoff

The investigation and local implementation are complete. Production flags,
schedules, caches and data remain unchanged, as do the shared Redis/egress plans.
The next step is staging acceptance using the owning guide, followed by matched
production measurement if rollout is authorized.

`TZ=UTC npm run verify -- -- --maxWorkers=2` passed with
`TEST_TIMETABLE_DATABASE_URL` set to local PostGIS: all 98 files and 671 tests
passed, including integration tests in isolated schemas. Docs, types, lint,
formatting and migration drift passed. The default parallel run hit two local
database test/hook timeouts; reducing concurrency passed without changing test
timeouts or production code. The overlapping-load regression failed before the
memo-fill correction and passed afterward, along with the existing promotion race.
