# Programmatic crowd reports and producer catalog

The authenticated report endpoint and v1 reference catalog were implemented on
July 18–19, 2026 and remain in source at the November 26 review. This closes the
site contract work; [monitor integration](../active/reddit-community-monitoring.md)
remains unverified. Implementation does not prove deployment or crawler cutover.

## Decisions and findings

### Measured Workload and Initial Cadence

A 2026-07-17 sample found approximately 54 new posts per day across the two
target subreddits and about 2.65 daily matches for a deliberately broad rail
keyword query. Manual sampling suggested only roughly one to three genuinely
live operational threads per month.

Reply traffic was front-loaded in representative disruption threads: roughly
77% to 88% of sampled replies arrived within three hours. This supports a small
fixed workflow schedule rather than a general polling scheduler or adaptive
watch queue. Start with four polls during the first hour, followed by polls at
three, six, and 24 hours. Change the cadence only after observing missed useful
updates or unnecessary request volume.

- 2026-07-17: Use a dedicated Worker because frequent mostly-empty Reddit
  discovery is a better fit for Cloudflare scheduling than waking the
  scale-to-zero site.
- 2026-07-18: Keep Reddit discovery in the existing crawler until the new
  monitor demonstrates equivalent coverage.
- 2026-07-18: Supersede the community-observation and community-claim designs
  with a programmatic crowd-report endpoint feeding the existing site pipeline.
- 2026-07-18: Keep conversations and workflow state entirely in the monitor;
  each useful post or reply becomes one independent structured report.
- 2026-07-18: Use one generic external report ID for retry safety instead of an
  event inbox, claim version, or site-side lifecycle.
- 2026-07-18: Defer OpenAPI generation until multiple producers or observed
  contract drift justify it.
- 2026-07-19: Expose a small authenticated `v1` reference catalog so machine
  producers can validate parsed IDs without coupling to site-internal tables or
  vendoring canonical data. Derive aliases only from canonical localized names.

## Maintained contract

The [producer guide](../../architecture/data-pipeline.md#programmatic-crowd-reports)
owns credentials, examples and retry semantics. Runtime validation lives in
[programmatic reports](../../../app/util/programmaticCrowdReports.ts); the
[schema](../../../app/db/schema.ts) owns the producer/external-ID uniqueness
constraint. The monitor retains source conversations and polling state; the site
receives independent structured reports through its existing moderation,
clustering and dispatch pipeline. Public Turnstile and abuse checks stay separate.

[Original plan](https://github.com/foldaway/mrtdown-site/blob/fdf2a7b8effd7916f85c7e990b8b50ed7540fc96/docs/plans/active/reddit-community-monitoring.md) preserves the detailed
boundary discussion and shadow/cutover gates. Reuse the existing contract rather
than implementing its completed endpoint and catalog phases again.
