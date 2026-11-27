# Scoped-query egress work, July–November 2026

The July query changes and November service-path rollout are delivered. This
record closes the superseded transfer-reduction program, not its original
numerical targets. [Neon sleep](../active/neon-sleep.md) owns new serving work;
[tech debt](../tech-debt.md#measure-incremental-cache-egress) retains optional
matched transfer and traffic attribution.

## Decisions

- 2026-07-21: Treat Neon public network transfer bytes as the production source
  of truth. Use `pg_stat_statements.rows` only to locate likely contributors,
  because row widths and selected columns vary.
- 2026-07-21: Exclude the mixed deployment hour from steady-state comparisons.
  Report full-day and matched-hour sensitivity alongside the central estimate.
- 2026-07-21: Keep this plan separate from the broad production-performance
  plan so database egress work has explicit query-family baselines and exit
  criteria.

The first tranche joined issue references directly and deduplicated them in SQL,
read report-form paths once, then replaced date-range ID chunk fan-out with one
latest-period CTE. Current owning sources are [read scope](../../../app/util/dbQueries/readModelScope.ts),
[range discovery](../../../app/util/dbQueries/issueRange.ts) and
[report references](../../../app/util/dbQueries/reportReferenceInputs.ts).
Later snapshots supersede request-time topology proposals; the
[runbook](../../operations/edge-caching.md) owns their current contracts.

## Measured results and limits

The July 29 transfer sample averaged the equivalent of 2.887 GB/day with
a median of 105.36 MB/hour. The plan still needs matched Cloudflare attribution
to evaluate the topology work.

July 22 production CTE sample: five calls, 360 final IDs, 72 rows/call; statistics
reset at `2026-07-22T11:36:10Z`. July 29 sample after reset
`2026-07-28T02:11:15Z`: 234 CTE calls, 16,576 IDs (70.84/call), confirming the
old fan-out was absent. The 13.9-hour sample still returned 2,740,116 path rows
across 1,667 reads and 99,968 path-scope rows across 1,396 reads. Row counts are
sizing proxies, not billed transfer or HTTP visits.

The 48 complete hours from July 26 through July 28 UTC transferred
5.774 GB (120.28 MB/hour mean, 105.36 MB/hour median, 2.887 GB/day equivalent).
July 26 and 27 totals were 2.435 and 3.338 GB. This missed the proposed
100 MB/hour median and 2.5 GB/day targets and lacked matching Cloudflare route
and cache-status attribution. No later measurement is asserted here.

The [scoped read-model record](scoped-public-read-model.md) owns the earlier
approximately 78% reduction. The [Redis rollout record](redis-page-profile-cache.md)
owns November deployment receipts and exact pre-cutover baselines.
[Original plan](https://github.com/foldaway/mrtdown-site/blob/fdf2a7b8effd7916f85c7e990b8b50ed7540fc96/docs/plans/active/production-egress-reduction.md) preserves the full July
query-family tables, 90%/50% per-family row targets, sensitivity analysis,
triage decisions and superseded phases. Do not reset production SQL counters
for measurement or record the private origin hostname in repository files.
