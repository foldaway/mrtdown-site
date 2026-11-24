# Let Neon sleep between canonical changes

## Purpose

Serve ordinary public reads without opening Postgres, so unchanged canonical
data can leave Neon suspended. The first tranche covers canonical range inputs
and unchanged-input pull checks. Arrival selection, profiles, optional rider
signals and other SQL readers remain subsequent tranches; this first change
alone cannot establish production-wide sleep.

## Progress

- [x] Confirm the current production compute remains effectively continuously
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

## Surprises & Discoveries

Existing range hits still select canonical generation, issues and holidays.
The scheduled pull acquires its SQL lease before fetching upstream metadata.
Both patterns defeat idle suspension even when bulk topology is cached.

## Decision Log

- 2026-11-21, user — Prioritize sustained Neon sleep while mrtdown-data is
  unchanged; reduced transfer alone is not acceptance.
- 2026-11-21, Codex — Publish raw canonical range inputs, not a clock-frozen
  assembled dataset. Retain the active immutable snapshot until superseded;
  requests read its Redis pointer without a SQL generation check. SQL remains
  the recovery path for missing/unavailable snapshots.

## Outcomes & Retrospective

The first tranche is implemented behind `REDIS_RANGE_SNAPSHOT`. SQL parity
checks cover request clocks, midnight/revision changes, corrected/open periods,
holiday republication and coherent cutover. Redis integration checks exercise
the real atomic publication script, persistent active data, stale publishers,
eviction/corruption repair and compressed/expanded bounds. Workflow checks prove
unchanged polls and their preflight failure cleanup never call getDb or SQL
lease helpers. The owning runbook documents publish-only validation and rollback.

Node 24.14.1 `npm run verify -- -- --maxWorkers=2` passed all 738 tests across
101 files with local PostGIS and Redis; no tests were skipped. Docs, types,
lint, formatting and migration drift passed. The production build passed.
A built-server fixture
served cold/warm issues-day and history requests with DATABASE_URL unset. The
fixture proves transport and lack of SQL dependency; local PostGIS parity tests
cover nonempty canonical data. Production-wide sleep remains unverified and
incomplete; the range rollout receipt below does not cover other SQL readers.

### Range rollout, November 22 PT

The [staging deployment](https://github.com/foldaway/mrtdown-site/actions/runs/45049953123)
and [production deployment](https://github.com/foldaway/mrtdown-site/actions/runs/45051886340)
installed merge `4604950`. Both environments published the existing completed
generation before enabling reads. Staging origin checks on both Machines
returned 200; the issues-day JSON was byte-identical to SQL, with a cold Redis
read followed by a memory hit. The unchanged staging pull completed with only
initialization and `check-published-range-inputs` steps.

Production's first pull failed closed because its live combined-release pin
was empty. The retained November 22 admission and completed projection already
identified manifest `8aece457` and release `c5e00a0b`. That exact index reproduced
the existing canonical fingerprint against current upstream inputs. Restoring
it in the production GitHub deployment environment and redeploying the same
image restored the deploy-managed setting. The retry repaired the range
snapshot without importing or rebuilding a projection; its generation stayed
`wfr_YYvm_nOVZ6nCepuq9XfqH`.

Production is now `enabled`. The 770,364-byte payload has no expiry, and its
completed checkpoint matches SQL. Both Machines returned 200 for history and
issues-day; the API JSON matched its SQL baseline byte for byte. Reader logs
showed cold Redis reads and warm memory hits on both Machines, and Cloudflare
accepted the data-tag purge. Unchanged pull `wfr_0GIebAtCs_uNsrYLSXQeU` completed
with only initialization and external preflight steps. The final check found
the same publication identity and canonical generation, with no active lease.
Both Fly health checks passed. These are origin checks, not evidence of public
Cloudflare cache hits or sustained Neon suspension.

A standalone deep-object diagnostic stalled one staging Machine. It was
restarted before activation, and normal origin-route comparisons replaced that
probe. Both staging health checks passed afterward.

The arrivals selection-policy extraction passed Node 24 verification: 742 tests
across 101 files with PostGIS and Redis, none skipped. Existing integration
scenarios cover shared memberships, loops, empty coverage, source correction,
topology mismatch, partial projections and reviewed rollback; no new tests were
added for the extraction.

### Arrival metadata producer

The next tranche publishes attested topology, hash-verified admission history,
projection coverage and display labels behind `REDIS_ARRIVAL_SNAPSHOT=publish`.
It shares the bounded atomic snapshot store with range inputs. The existing
selection policy produces the same decisions from a cold Redis snapshot as
from SQL, including zero-active dates and uncovered dates. Failed rebuilds or
partial promotion cannot replace the completed head.

Missing arrival metadata prevents the enabled range preflight from skipping
its repair. Successful metadata publication precedes purge and external
checkpoint completion; a healthy matching generation/fingerprint keeps the
unchanged path SQL-free. The departure producer and separately gated public reader follow below. No arrival publication flag was set in staging or
production for this tranche. The [runbook](../../operations/edge-caching.md#published-arrival-metadata)
owns limits and the separate publish-only staging procedure.

### Departure producer

Bounded station/projection partitions publish in resumable pull steps and
activate together through the existing snapshot publisher. Round-trip checks
cover both timetable formats; publication checks cover interruption, source
changes and checkpoint ordering. Public serving remains off by default. No
producer flags were enabled. Next: measure staging payload size and publication latency
using the [runbook](../../operations/edge-caching.md#published-departure-partitions).
Later pulls now reuse verified completed projections across unrelated canonical
changes; the runbook owns repair and rollout behavior.

### Recent arrival reports

Recent reports now publish from committed writes behind the off-by-default
`REDIS_ARRIVAL_REPORTS` gate. Healthy reads—including empty results, expiry and
midnight/topology revalidation—use no SQL. Schedule serving has a separate gate
below; no flags were activated. The [runbook](../../operations/edge-caching.md#recent-arrival-reports)
owns initialization, failure handling and rollback.

Node 26 `npm run verify -- -- --maxWorkers=2` passed all 758 tests with local
PostGIS and Redis, none skipped. The three added integration scenarios cover
writes/failure, latest-first expiry and scope changes, with SQL disabled on hits.

### Public arrivals reader

The v2 handler can now use coherent published metadata and bounded departure
partitions behind off-by-default `REDIS_ARRIVAL_READS=enabled`. Database access
is lazy and reserved for unavailable required inputs or a cached scope rejection.
Only rejected scopes check SQL generation, so a promotion can recover new scopes
before publication while matching-generation rejections still return 400. It reuses canonical scope
validation, timetable selection, date-tail selection and response assembly from
the SQL reader. Optional report failure/absence is omitted on a published hit;
SQL-backed requests retain the existing report recovery behavior.

Node 26 `npm run verify -- -- --maxWorkers=2` passed 761 tests across 101 files
with disposable local PostGIS/Redis and none skipped. Three added scenarios
exercise the full handler with database access throwing on cold/warm hits,
midnight/24+ tails, empty/expired reports, coverage republication and required
input failure/recovery. The existing combined fixture also compares shared
boarding, nondefault platforms and loop termini with SQL.

Review follow-up adds a nullable report-destination migration and preserves the
validated branch through publication. Cached legacy/mismatched reports are
omitted. Coverage rows are grouped once per date before projection selection.
Node 26 verification passed 763 tests across 101 files, none skipped; added
regressions cover destination changes and generation-aware scope recovery.

No deployment or activation occurred. Publish-only staging payload size and
publication latency remain rollout gates in the
[runbook](../../operations/edge-caching.md#published-arrivals-reader). Entity
profiles, sitemap/statistics and background readers remain independent wake-ups.

### Sitemap follow-up

The next bounded item-3 slice publishes sitemap inputs behind off-by-default
`REDIS_SITEMAP_SNAPSHOT`. Healthy reads avoid both the Postgres sitemap snapshot
query and the legacy earliest-issue-date query. Canonical completion and facts
rebuilds publish from a completed SQL snapshot; unchanged pulls verify/repair
the publication. Request dates and archive paths remain clock-dependent.
The [runbook](../../operations/edge-caching.md#published-sitemap-inputs) owns
seeding, activation and rollback. No deployment or activation occurred.
Entity profiles/directories, SQL-backed statistics, Issue Profile misses and
other background readers remain item-3 work; this slice cannot establish
production-wide sleep.

Node 26 `npm run verify -- -- --maxWorkers=2` passed 767 tests across 101 files
with local PostGIS/Redis, none skipped. Four scenarios in existing suites cover
SQL-disabled cold/warm reads, clock/empty paths, partial promotion and
write-driven repair/fallback. The existing Redis suite covers the shared
store's persistence, validation and delayed-publisher protection.

### Background holiday follow-up

The bounded item-4 slice adds an off-by-default holiday source preflight. A
completed unchanged source skips database access and SQL lease helpers. Pending
fact dates survive committed writes; the existing writer lease and a persistent
Redis writer token prevent overlapping/replayed workflows from certifying stale
work. The receipt follows facts, publication and purge. See the
[runbook](../../operations/edge-caching.md#unchanged-holiday-checks) for seeding,
rollback and intentional remaining wake-ups. No deployment, schedule change or
activation occurred. Disruption dispatch still uses its authoritative SQL queue;
entity profiles and statistics remain outside this slice.

Node 26 `npm run verify -- -- --maxWorkers=2` passed all 773 tests across
101 files with local PostGIS/Redis and none skipped. Existing suites cover
SQL-disabled unchanged checks, unknown inputs, repair after committed writes,
writer contention, superseded receipts and facts/publication/purge retries.

## Context

[Range reads](../../../app/util/dbQueries/issueRange.ts) own history, overview,
issues-day and report range assembly. The existing
[cache runbook](../../operations/edge-caching.md) owns deployed cache flags.
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
The remaining producer and reader work above is required before claiming
zero-SQL arrivals; this extraction alone does not change the sleep boundary.

## Validation and Acceptance

Use local PostGIS and Redis for immutable-publication and SQL-parity checks.
Valid cached range reads must succeed with a database accessor that throws.
Check midnight, service revisions, corrected/open-ended periods, holidays,
empty ranges, invalid/oversized payloads, eviction and overlapping publication.
An unchanged scheduled pull must call neither getDb nor lease helpers. Changed
inputs and explicit repair must still complete publication and purge in order.
Run `npm run verify`; no production fault injection or automatic rollout.
