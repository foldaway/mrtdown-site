# Avoid SQL recovery caused by cold cache timeouts

Concurrent reads of valid snapshots reproduced SQL recovery locally at the
production CPU/RAM limits. Decoding, whole-input copying and rendering delay
Redis response handling beyond the former 500 ms command deadline. The exact
first query that resumed production Neon remains unconfirmed.

The fix copies arrival coverage only for the requested station, shares concurrent
cold snapshot loads, and gives commands 1,500 ms while retaining the 500 ms
connection timeout. See the [cache runbook](../operations/edge-caching.md#published-arrivals-reader)
for reader behavior and the recovery tradeoff. Production activation and
first-query attribution remain separate follow-ups.

## Production evidence

Investigated `c7790357fa17e6c1bbd02ed6c866bf4a0288b06d` (PR #353) using the
supplied handoff and captured logs. Production access remained passive.

| UTC on November 27 | Captured observation |
| --- | --- |
| 00:07:44 | Fly Machine `d8917e1a312968` started. |
| 00:07:51.611–53.274 | `/towns/outram` returned 200 after 1,663.55 ms. |
| 00:07:52.334–54.682 | `/ta/issues/2019-11-08-nel-maintenance` returned 200 after 2,348.58 ms. |
| 00:07:53 | Provider timeline records Neon resuming. |
| 00:07:53.296 | First captured `pg-connection-string` SSL warning. |
| 00:08:23.574 | SQL `schedule_topology_read`: 3,812 rows, 173,501 JSON bytes, `reason=cold`. |
| 00:08:23.777 | BGB → JUR / NSL_MAIN_N arrival response completed after 1,148.68 ms. |
| 00:13:46 | Provider timeline records suspension. |

Request starts are completion timestamps minus logged durations. The issue
request overlapped the connection warning; the town response had finished about
22 ms earlier. This makes the issue request a stronger candidate for the first
wake, without proving its query or fallback reason. Navigation can independently
recover through SQL during either page request. The earlier `/stations/MPR`
request overlapping the `23:53:45Z` resume is another timing candidate.

The topology event confirms later arrival SQL. Its `cold` reason describes the
SQL topology memo, not why the published arrival reader returned null. Pool
initialization warnings cannot identify the initiating statement.

The supplied rolling hour (`23:27:49Z`–`00:27:49Z`, November 26–27) recorded
1,217 active and 2,383 idle seconds, with three new resumes. The 300-second idle
timeout means active intervals do not establish continuous querying. The handoff
reports initialized caches, repaired community caches, SQL-disabled read parity,
and unchanged canonical/holiday jobs using only external readiness checks.
Successful reads and PR #353's sequential workflow checks do not establish
reliable cold serving under ordinary concurrent requests.

## Local reproduction and fix validation

Used the built server with its Sentry preload, Node 26.13.1 Linux, two CPUs,
512 MB RAM and 512 MB additional swap allowance. V8 reported a 268 MB heap limit.
`DATABASE_URL` was unset for request experiments, making SQL recovery visible.
Local PostGIS schemas and Redis prefixes were isolated and removed afterward.

The local corpus contained 765 issues. Station inputs measured 4,587,575 JSON
bytes / 878,340 encoded bytes; issue inputs measured 8,848,791 / 1,773,852 bytes.
The arrival cost fixture used real canonical topology/names and 53,680 synthetic
scope rows, matching the supplied November 22 row count: 450,392 encoded bytes.
It had no timetable history or departure partitions and exercised valid uncovered
responses. Actual scheduled-departure correctness was checked separately by the
SQL/cache integration suite.

Navigation and initialized-empty community fixtures allowed complete page
rendering. An initial run without Navigation was excluded because that missing
fixture independently caused recovery. Timings measured client commands,
decode/selection/copy, rendering and SQL accessor attempts using local build hooks.

A town/issue pair passed cold and warm. Adding a station and four arrivals caused
valid station/issue payload reads to time out at approximately 584–594 ms, followed
by SQL accessor attempts; the warm repeat passed. RSS was approximately 408 MB.
This reproduced failure independently of the earlier 192 MB diagnostic child.

Selecting arrival scope rows before copying reduced that work from 49–71 ms to
2–7 ms per request. Across three fresh runs, SQL accessor counts fell from
2, 1, 2 to 0, 0, 1; the remaining issue payload expired at 500.506 ms. Scoped
copying alone was insufficient.

Then tested scope selection plus shared cold loads with four command deadlines.
Each fresh process served 13 concurrent requests (two town, one station, two
issue, eight arrivals split across BGB/RFP), followed by the same repeat batch.

| Command budget | Runs with SQL recovery | Largest successful command by run | End RSS |
| --- | --- | --- | --- |
| 500 ms | 2 / 3 | 489, 411, 485 ms | 337–380 MB |
| 1,000 ms | 0 / 3 | 533, 531, 540 ms | 378–404 MB |
| 1,500 ms | 0 / 3 | 574, 523, 557 ms | 350–405 MB |
| 2,000 ms | 0 / 3 | 530, 475, 492 ms | 372–407 MB |

At 500 ms, one timer was not handled until 1,130 ms after dispatch. Choose
1,500 ms to leave headroom above normal completion and that observed scheduling
delay; 2,000 ms provided no observed benefit. All 78 responses at 1,500 ms
succeeded without SQL, with only four successful snapshot payload reads per
process. Loopback Redis, synthetic rows and host scheduling differ from
Fly/Upstash; these samples do not establish production reliability or an optimum.

Pausing response handling on the local established connection caused command
failures at 1,501–1,506 ms and SQL accessor attempts. Recovery remains available,
with approximately one additional second of waiting for an unresponsive command.
This paused only the diagnostic client's stream, not the Redis server.

`npm run verify -- -- --maxWorkers=2` passed 829 tests across 103 files without
skips, with local PostGIS/Valkey and UTC. Checks include publication races,
independent heads, mutation isolation, failed/corrupt/schema-invalid shared loads,
verification during a fill and against warm memos, tier isolation, station coverage
selection, actual timetable parity, loops/platforms, midnight and SQL recovery.
Build passed. The existing informational lint suggestion remains non-failing.

## Remaining attribution and rollout

Review production activation separately. After deployment, acceptance requires
passive provider resume/suspend evidence across cold starts and ordinary traffic.
Local success does not identify the first production query.

If wake-ups remain unexplained, add opt-in recovery events with fixed reader and
stage names, bounded reasons, durations and Redis readiness. Correlate them with
a request ID/route template and one first-actual-query event per process, using
only a query-shape hash and operation label. Distinguish transaction BEGIN from
the reader; exclude SQL text, values, raw URLs, payloads and command arguments.
Redis reconnect readiness is another unconfirmed hypothesis, not an established
cause of the captured wake.

## Reproduction evidence

Raw handoff: `/private/tmp/mrtdown-neon-cold-start-handoff-2026-11-26.json`.
Captured Fly logs: `/private/tmp/mrtdown-neon-hour-d8917e1a312968.log`,
`/private/tmp/mrtdown-neon-hour-d8d9567c506438.log`, and
`/private/tmp/mrtdown-production-wake-attribution.log`. These are capped streams
of pretty-printed objects, not JSONL. Decode with successive
`json.JSONDecoder.raw_decode` calls and normalize nanoseconds if parsing timestamps.

Local evidence is under `/private/tmp/mrtdown-cold-investigation/`.
`REPRODUCE.txt` records the initial comparison; `hardening-reproduce.txt` records
repeat commands for the fix. `comparison.json` and `hardening-matrix.json` retain
results; the matching logs, corpus inputs and harnesses remain alongside them.
`hardening-unresponsive.log`, `hardening-parity.log` and `hardening-verify.log`
record recovery and validation. Temporary harnesses/keys were removed from the
application/services, and a normal rebuild removed diagnostic build hooks.
Temporary artifacts may expire; the observations above are the durable record.
