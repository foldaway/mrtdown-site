# Optional follow-ups

These are candidates, not scheduled work or evidence of an unresolved rollout.
Promote one to a focused issue or plan when its trigger is met. Source changes
must still satisfy the active plan's correctness and verification gates.

## Measure incremental cache egress

Owner: serving/cache maintenance. Trigger: a cost or transfer decision needs
attribution beyond the [Neon sleep](active/neon-sleep.md) outcome. The service-path
rollout is verified; its incremental provider impact is unmeasured.

The [Redis rollout record](completed/redis-page-profile-cache.md#measurement-handoff)
retains the exact 23-hour baseline and post-cutover boundary. A retrospective
comparison may now be confounded by later deployments or unavailable telemetry;
state that limit rather than claiming causality. For a new experiment, collect
matched complete windows, normalize Neon bytes by Fly responses, compare p95 and
Redis commands/bandwidth/cost, and account for route mix. Use Cloudflare route/cache
analytics if available; SQL rows are neither billed bytes nor HTTP requests.
Preserve SQL statistics reset timestamps without resetting production counters.

The [July egress record](completed/production-egress-reduction.md) retains original
unmet transfer targets and triage decisions. Landmark/query cleanup or cache-key,
TTL and bot changes need current route-specific evidence before implementation;
the old phase list is not a mandate to perform them.

## Protected schematic map designer

Owner: map authoring. Trigger: the [generated renderer](active/dynamic-system-map.md)
passes baseline import, interaction and visual acceptance, and a maintainer needs
visual authoring. Reuse the data repo's reviewed submission contract; edit
rules/constraints, preview with the same renderer, and submit a normal reviewed
data PR. Do not make the site a canonical writer or store generated TSX as source.

## Additional Markdown discovery

Owner: public route discovery. Trigger: measured agent traffic warrants localized
Markdown, XML sitemap inclusion or alias URLs. The
[completed Markdown record](completed/markdown-for-agents.md) retains initial
scope; keep `llms.txt` and canonical `index.md` policy until an explicit decision.

## Broader read-model types

Owner: read-model maintenance. Trigger: a feature already touches legacy response
types. Prefer canonical `@mrtdown/core` types and reduce the temporary `app/types.ts`
boundary incrementally; do not create a standalone rewrite without a demonstrated
benefit. The [overhaul record](completed/overhaul-read-model.md) is historical.
