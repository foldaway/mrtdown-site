# Let Neon sleep between canonical changes

## Purpose

Serve ordinary public reads without opening Postgres, so unchanged canonical
data can leave Neon suspended. Range, arrival, report and sitemap cache rollouts
and unchanged-input preflights are complete. Entity/profile, statistics and
background SQL dependencies remain; production-wide sleep is not established.

## Progress

- [x] Confirm the pre-rollout production compute remained effectively continuously
  active despite the reference/path caches and arrival topology memo.
- [x] Publish immutable, bounded range source snapshots and an atomic Redis head.
- [x] Assemble ranges at the request clock without SQL on a valid snapshot hit.
- [x] Skip unchanged pulls before acquiring a SQL lease; repair absent snapshots.
- [x] Cover holiday publication, corruption/fallback, publication races and
  SQL parity across date boundaries; run repository verification.
- [x] Separately validate staging and the user-authorized production cutover.
- [ ] Remove remaining public/background wake-ups and verify sustained sleep.

### Arrivals follow-up

- [x] Separate timetable eligibility, coverage and reviewed rollback decisions
  from SQL reads so published inputs can reuse the same policy.
- [x] Publish coherent admission history, topology, projection/coverage metadata
  and display labels; reject partial promotions and failed projections.
- [x] Publish bounded departure partitions for all retained covered dates,
  preserving untimed counts, shared memberships, platforms and 24+ hour tails.
- [x] Serve recent rider reports, including empty results and expiry, without
  polling Postgres. Refresh them from their write paths.
- [x] Prove the complete arrivals endpoint works with SQL disabled across clock,
  correction, coverage and report changes before a separate activation.

### Community disruption signals follow-up

Source now caches home, station and line public signal inputs separately from
arrival reports. Writers invalidate/refresh, and an explicit repair command
initializes empty results. See the [runbook](../../operations/edge-caching.md#public-community-disruption-signals).
Deployment and production verification remain separate; this change does not
establish whole-site sleep.

### Public profiles and directories follow-up (audit item 2)

1. Station profiles: publish a separate bounded source graph and share the
   existing HTML/server-function/Markdown loader. Source implementation and
   local parity checks are complete. `npm run verify` passed 786 tests across
   101 files with disposable PostGIS/Redis and no skips on November 26. Review
   and rollout are separate.
2. Line profiles: reuse the station source graph with operator labels and dated
   ranking facts. Complete loader cold/warm SQL parity and repository verification
   passed locally on November 26 (793 tests, 102 files, no skips, disposable
   PostGIS/Redis). Review and rollout remain separate. The line directory remains
   in step 3. First focused PR: [#344](https://github.com/foldaway/mrtdown-site/pull/344).
3. Station and line directories: reuse the shared graph with persisted active
   issue-day candidates and latest station disruptions. Local cold/warm complete
   loader parity preserves future/closed memberships, moving ranking windows,
   null uptime and absent day facts. `npm run verify` passed 795 tests across
   102 files with disposable PostGIS/Redis and no skips on November 26. Review
   and rollout remain separate. PR: [#345](https://github.com/foldaway/mrtdown-site/pull/345).
4. Operator profiles: reuse the shared graph and issue-scope selector. Full loader
   cold/warm parity covers historical ownership, empty/unknown operations and
   incident boundaries with SQL disabled. `npm run verify` passed 797 tests
   across 102 files with disposable PostGIS/Redis and no skips on November 26.
   Review and rollout remain separate. There is no separate operator directory
   loader; line directories include operator labels. PR:
   [#346](https://github.com/foldaway/mrtdown-site/pull/346).
5. Town profiles and directory: reuse the existing graph and profile selector.
   Local full-loader SQL parity covers cold/warm operation with DB access throwing,
   future/closed/unknown/empty towns, request-clock issue windows and coherent
   station/town relationship corrections. `npm run verify` passed 799 tests across
   102 files with disposable PostGIS/Redis and no skips on November 26. Review
   and rollout remain separate.

Local canonical-corpus validation matched BKP and its BP6 alias cold/warm with
SQL disabled on November 26 and the December 26 service boundary. The corpus had
233 stations and 765 issues; the station payload was 877,636 encoded bytes
(limit 4 MiB). These are local source measurements, not production evidence.
Duplicate exit labels now use the same ID tie-breaker in SQL and publication.

Each slice above covers its named route family. Source completion, review and
production rollout are separate; sustained whole-site sleep is not established.

### Statistics follow-up (audit item 3)

Source now publishes the persisted statistics rebuild after completed canonical
promotion and authenticated facts rebuilds. Healthy cold/warm loaders and
unchanged-pull preflight use Redis without SQL. Recovery uses SQL and bypasses
shared caching. Rolling windows retain the rebuild clock across midnight and
cache repair. See the [pipeline boundary](../../architecture/data-pipeline.md#published-statistics).
Review and rollout are separate; this slice does not establish whole-site sleep.

### Issue Profiles follow-up (audit item 4)

Full issue reads now use the shared bounded snapshot store and request-clock
assembly. Unknown IDs and invalid inputs retain uncached SQL recovery; the
[runbook](../../operations/edge-caching.md#published-issue-profile-inputs) owns repair.
Local checks cover all 765 canonical issues at November 26 and December 26 clocks.
Deployment and whole-site sustained sleep remain unverified.

## Surprises & Discoveries

Before source snapshots, range hits still selected canonical generation, issues
and holidays, and scheduled pulls acquired a SQL lease before fetching upstream
metadata. Both patterns defeated idle suspension despite bulk topology caches.

## Decision Log

- 2026-11-21, user — Prioritize sustained Neon sleep while mrtdown-data is
  unchanged; reduced transfer alone is not acceptance.
- 2026-11-21, Codex — Publish raw canonical range inputs, not a clock-frozen
  assembled dataset. Retain the active immutable snapshot until superseded;
  requests read its Redis pointer without a SQL generation check. SQL remains
  the recovery path for missing/unavailable snapshots.

## Outcomes & Retrospective

Range, arrivals, reports, sitemap and holiday preflight rollout is complete in
staging and production at `3fa45dedec3d374a33a5386c9272bd8d5bbee25b`.
[Staging deployment](https://github.com/foldaway/mrtdown-site/actions/runs/45431025187)
and [production deployment](https://github.com/foldaway/mrtdown-site/actions/runs/45431344887)
passed. Both production Machines served healthy origin responses on that SHA.
Rollout flags have been retired in source; Redis configuration now selects the
supported cache path. The [runbook](../../operations/edge-caching.md) owns repair.
This cleanup does not deploy code or remove live secrets.

- Staging: 184 departure partitions, 7,186,456 encoded bytes, largest 102,544
  bytes, one projection digest. Initial rebuild took about 6m46s; reuse took 22s.
- Production: 368 partitions, 15,478,788 bytes, largest 131,012 bytes, two
  projection digests. Every hash matched the previous publication; active keys
  were persistent and heads coherent.
- Publication `wfr_jCkwr7iSMu7yq-jtDTbjz` succeeded in 25,764ms with plan and
  activation, without any partition publication steps. Departure manifest digest:
  `6650958b9d37eab43eed5c831c8feccfb342806a4f5b24bd08306593b61c85e8`.
- Unchanged pull `wfr_PNpNCNWR2dbm5QQytYF2k` finished in 4,501ms with only
  initialization and canonical preflight. Holiday receipt initialization and
  subsequent unchanged run `wfr_XxBi2mw3bD7IAPpqEWMll` proved the same boundary
  in 5,323ms. Both preflights returned true with `DATABASE_URL` unset.
- Full v2 branch/platform responses matched SQL at a fixed daytime clock,
  cold/warm without `DATABASE_URL`. Live origin arrivals returned 200 with
  scheduled/complete coverage and `no-store`. SQL and both sitemap origins matched
  SHA-256 `13ddf548289a99272ada11e47e01de1252a4ff9cc921ccb1e2969f4627648008`.

The first production upgrade exhausted QStash's daily 1,000-message quota after
manifest activation. Failed run `wfr_mPROlIO3fGVs-troZTArq` remains in DLQ as
evidence; its handler released the lease and the fresh publication recovered
after quota reset. Do not resume the obsolete run.

Cloudflare accepted the production data-tag purge. Command-line public checks
encountered a challenge, so these checks establish origin behavior, not edge HIT.
Neon remains min=max 0.25 CU with a 300-second idle timeout; no compute or plan
change was made. Entity/profile, statistics, Issue Profile misses and disruption
dispatch still need SQL. Sustained whole-site sleep remains unverified.

Pre-cleanup verification passed 773 tests across 101 files with local PostGIS and
Redis and no skips, plus docs/types/lint/format/migration checks. The cleanup
retains parity, fallback, publication, scope, report and writer safeguards while
removing obsolete mode combinations. Node 26.5.0 cleanup verification
(`npm run verify -- -- --maxWorkers=2`) passed 770 tests across 101 files with
local PostGIS/Redis and no skips. Three obsolete flag-combination cases were
removed; the existing informational lint suggestion remains.

## Context

[Range reads](../../../app/util/dbQueries/issueRange.ts) own history, overview,
issues-day and report range assembly. The existing
[cache runbook](../../operations/edge-caching.md) owns cache operation and repair.
Canonical pulls already serialize writers with a SQL lease and only finish
after promotion, derived models, publication and purge. Holiday changes are
independent inputs and must republish before their purge.

## Plan of Work

### Milestone 1 — Zero-SQL canonical range reads

Separate source-row loading from pure clock-dependent dataset assembly. Publish
compressed, content-addressed source inputs from one completed repeatable-read
snapshot. Validate bounds, encoding and digest before using the source. Switch
the Redis head atomically only after the immutable payload exists. Keep the
previous completed head usable during imports, and reject delayed publication
with compare-and-swap. Recompute overlap and service/issue state at request time.

### Milestone 2 — Unchanged polls do not wake Postgres

Fetch and fingerprint upstream inputs before the SQL lease. A valid published
head with the same fingerprint can finish without SQL; explicit seeds, reviews,
rebuilds, missing snapshots and changed inputs retain the existing writer path.
Publish the successful external checkpoint only after the pull is complete.

### Milestone 3 — Finish the sleep boundary

Audit arrival selection/departures, entity profiles, Navigation/Issue Profile
validation, optional reports, sitemap/statistics and background workflows.
Publish their required serving inputs on writes. Keep reports/admin/recovery
wake-ups explicit. Accept production-wide sleep only with provider state and
compute-time evidence under ordinary traffic, without SQL monitoring waking it.

Start with the arrivals polling path: station pages refresh it every 30 seconds.
The first follow-up extracts the existing selection policy; the SQL adapter
still owns one repeatable-read transaction and canonical scope validation.
Publishers and future snapshot readers must reuse that policy rather than
relaxing admission or duplicating eligibility rules. Cache source inputs, not
clock-frozen arrival responses. Midnight alone must not require a SQL refill.
Arrivals rollout is complete; remaining entity/profile and background SQL reads
still prevent acceptance of the whole-site sleep boundary.

## Validation and Acceptance

Use local PostGIS and Redis for immutable-publication and SQL-parity checks.
Valid cached range reads must succeed with a database accessor that throws.
Check midnight, service revisions, corrected/open-ended periods, holidays,
empty ranges, invalid/oversized payloads, eviction and overlapping publication.
An unchanged scheduled pull must call neither getDb nor lease helpers. Changed
inputs and explicit repair must still complete publication and purge in order.
Run `npm run verify`; no production fault injection or automatic rollout.
