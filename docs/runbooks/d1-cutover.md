# D1 Cutover Runbook

This runbook covers the production switch from the old Postgres/Hyperdrive
database to Cloudflare D1. Canonical transit rows are rebuilt from
`mrtdown-data`.

As of the D1 migration work, production has no crowd-report rows. The default
cutover path therefore does not import Postgres site-local state. Public
holidays are refreshed from data.gov.sg by the D1 public-holiday workflow.

If crowd-report rows appear before the production freeze, pause cutover and
prepare a one-off migration plan for those rows.

## Inputs

- A deployed D1 database with all Wrangler migrations applied.
- The production `D1_DATABASE_ID` GitHub environment variable.
- `D1_CUTOVER_READY=false` until every validation step below passes.

## Default Production Sequence

1. Keep `D1_CUTOVER_READY=false`.
2. Apply production D1 migrations through the deploy workflow preflight.
3. Deploy or invoke the D1-backed Worker in the isolated cutover environment.
4. Trigger the canonical pull workflow and wait for it to complete.
5. Trigger the public-holiday workflow and wait for it to complete.
6. Confirm canonical `lines` and `stations` exist in D1.
7. Confirm the old Postgres crowd-report tables are empty:

   ```sql
   select count(*) as crowd_reports from crowd_reports;
   select count(*) as crowd_report_clusters from crowd_report_clusters;
   select count(*) as crowd_report_moderation_events from crowd_report_moderation_events;
   select count(*) as crowd_report_rate_limits from crowd_report_rate_limits;
   select count(*) as crowd_report_abuse_events from crowd_report_abuse_events;
   ```

8. If every count is zero, skip Postgres site-local import.
9. Run route checks for `/`, `/statistics`, `/history`, representative line,
   station, operator, issue, Markdown, and sitemap routes.
10. Run a crowd-report dispatch dry run:

    ```sh
    curl -X POST "$VITE_ROOT_URL/internal/api/tasks/crowd-report-dispatch" \
      -H 'content-type: application/json' \
      --data '{"dryRun":true}'
    ```

11. Set `D1_CUTOVER_READY=true` only after row-count and route validation pass.
12. Run the production deploy.

## Recovery

If validation fails before production traffic is switched, keep
`D1_CUTOVER_READY=false`, fix the D1 pull or workflow state, and rerun the
relevant step.

If route validation fails after D1 traffic is live, set `D1_CUTOVER_READY=false`
to block newer deploys and revert the D1 cutover stack to the last
Postgres/Hyperdrive deployment.
