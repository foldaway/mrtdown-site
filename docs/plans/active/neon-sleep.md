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
- [ ] Separately validate staging and an explicitly authorized production cutover.
- [ ] Remove remaining public/background wake-ups and verify sustained sleep.

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
cover nonempty canonical data. Production has not been deployed or changed for
this tranche, and production-wide sleep remains unverified and incomplete.

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

## Validation and Acceptance

Use local PostGIS and Redis for immutable-publication and SQL-parity checks.
Valid cached range reads must succeed with a database accessor that throws.
Check midnight, service revisions, corrected/open-ended periods, holidays,
empty ranges, invalid/oversized payloads, eviction and overlapping publication.
An unchanged scheduled pull must call neither getDb nor lease helpers. Changed
inputs and explicit repair must still complete publication and purge in order.
Run `npm run verify`; no production fault injection or automatic rollout.
