# Published serving inputs, November 2026

The range/arrival tranche has dated production verification below. Later route
families are implemented in source with local checks; their deployment and
whole-site sleep remain separate acceptance in [the active plan](../active/neon-sleep.md).
This record closes delivered source tranches without asserting a production
cutover for them.

## Range and arrival rollout receipts

The recorded range, arrivals, reports, sitemap and holiday preflight rollout completed in
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
At that observation, Neon was min=max 0.25 CU with a 300-second idle timeout;
no compute or plan change was made. Entity/profile, statistics, Issue Profile
misses and disruption dispatch still needed SQL. Sustained sleep was unverified.

Pre-cleanup verification passed 773 tests across 101 files with local PostGIS and
Redis and no skips, plus docs/types/lint/format/migration checks. The cleanup
retains parity, fallback, publication, scope, report and writer safeguards while
removing obsolete mode combinations. Node 26.5.0 cleanup verification
(`npm run verify -- -- --maxWorkers=2`) passed 770 tests across 101 files with
local PostGIS/Redis and no skips. Three obsolete flag-combination cases were
removed; the existing informational lint suggestion remains.

Later source changes below add published-input paths; they do not retroactively
change that production evidence. The following local receipts retain the status
recorded at each slice, rather than claiming current review or deployment state.

## Later source verification and review boundaries

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
   and rollout remain separate. PR: [#347](https://github.com/foldaway/mrtdown-site/pull/347).
6. Producer safety: make all requested fact-date batches and the station projection
   atomic, and hold profile publication during pending holiday fact repair.
   Injected final-projection failures preserve every fact table and the previous
   publication for single-date, explicit-date and range rebuilds. Final
   `npm run verify` passed 803 tests across 102 files with disposable PostGIS/Redis
   and no skips on November 26. Source work for this group is complete; review
   and deployment remain separate. Other audit groups still prevent whole-site
   sleep acceptance.

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

## Additional source changes by November 26

Source on `fdf2a7b8effd7916f85c7e990b8b50ed7540fc96` also contains the idle
accepted-report queue proof ([#350](https://github.com/foldaway/mrtdown-site/pull/350)),
report options/catalog publication ([#351](https://github.com/foldaway/mrtdown-site/pull/351)),
and public community-report details ([#352](https://github.com/foldaway/mrtdown-site/pull/352)).
No new rollout verification was performed by this documentation review.

[Original plan](https://github.com/foldaway/mrtdown-site/blob/fdf2a7b8effd7916f85c7e990b8b50ed7540fc96/docs/plans/active/neon-sleep.md) preserves the full initial milestones and
decisions. Use the [cache runbook](../../operations/edge-caching.md) for current
repair and the [pipeline guide](../../architecture/data-pipeline.md) for writer
ordering; historical flag and seed instructions are superseded.
