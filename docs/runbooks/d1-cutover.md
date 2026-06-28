# D1 Cutover Runbook

This runbook covers the production switch from the old Postgres/Hyperdrive
database to Cloudflare D1. Canonical transit rows are rebuilt from
`mrtdown-data`. The cutover does not import rows from Postgres.

## Inputs

- A production D1 database with all Wrangler migrations applied.
- The production `D1_DATABASE_ID` GitHub environment variable.
- Realistic production D1 readiness minimums in GitHub environment variables:
  `D1_MIN_LINES`, `D1_MIN_STATIONS`, `D1_MIN_SERVICES`,
  `D1_MIN_SERVICE_REVISIONS`, `D1_MIN_PUBLIC_HOLIDAYS`,
  `D1_MIN_LINE_DAY_FACTS`, and `D1_MIN_STATISTICS_SNAPSHOTS`.
- `D1_CUTOVER_READY=false` until every validation step below passes.
- Temporary read access to the old Postgres database for no-import checks.
- Cloudflare credentials for `wrangler d1 execute` validation queries.

## No-Import Policy

Do not copy canonical or site-local rows from Postgres into D1 during cutover.
Canonical transit rows are rebuilt from `mrtdown-data`; public holidays are
refreshed from data.gov.sg by the public-holiday workflow.

During the production freeze, confirm old Postgres crowd-report tables are
empty. If any rows exist, pause cutover and decide whether those reports can be
discarded, manually recreated through the D1-backed UI, or handled by a separate
one-off migration.

## Production Sequence

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
   select count(*) as crowd_report_cluster_lines from crowd_report_cluster_lines;
   select count(*) as crowd_report_cluster_stations from crowd_report_cluster_stations;
   select count(*) as crowd_report_lines from crowd_report_lines;
   select count(*) as crowd_report_stations from crowd_report_stations;
   select count(*) as crowd_report_moderation_events from crowd_report_moderation_events;
   select count(*) as crowd_report_rate_limits from crowd_report_rate_limits;
   select count(*) as crowd_report_abuse_events from crowd_report_abuse_events;
   ```

8. Inject the real production D1 database ID into the local Wrangler config:

   ```sh
   CLOUDFLARE_ENV=production \
   D1_DATABASE_ID="$D1_DATABASE_ID" \
   npm run cf:prepare-d1-config
   ```

9. Confirm D1 has rebuilt canonical/public state and has no pre-cutover
   crowd-report rows:

   ```sh
   D1_MIN_LINES="$D1_MIN_LINES" \
   D1_MIN_STATIONS="$D1_MIN_STATIONS" \
   D1_MIN_SERVICES="$D1_MIN_SERVICES" \
   D1_MIN_SERVICE_REVISIONS="$D1_MIN_SERVICE_REVISIONS" \
   D1_MIN_PUBLIC_HOLIDAYS="$D1_MIN_PUBLIC_HOLIDAYS" \
   D1_MIN_LINE_DAY_FACTS="$D1_MIN_LINE_DAY_FACTS" \
   D1_MIN_STATISTICS_SNAPSHOTS="$D1_MIN_STATISTICS_SNAPSHOTS" \
     npm run d1:check-readiness -- production

   npx wrangler d1 execute DB --env production --remote --command \
     "select 'crowd_reports' as table_name, count(*) as rows from crowd_reports
      union all select 'crowd_report_clusters', count(*) from crowd_report_clusters;"
   ```

10. Run route checks for `/`, `/statistics`, `/history`, representative line,
    station, operator, issue, Markdown, and sitemap routes.
11. Run a crowd-report dispatch dry run:

    ```sh
    curl -X POST "$VITE_ROOT_URL/internal/api/tasks/crowd-report-dispatch" \
      -H 'content-type: application/json' \
      --data '{"dryRun":true}'
    ```

12. Set `D1_CUTOVER_READY=true` only after no-import checks, route validation,
    and dispatch dry run pass.
13. Run the production deploy.

## Recovery

If validation fails before production traffic is switched, keep
`D1_CUTOVER_READY=false`, fix the D1 pull or workflow state, and rerun the
relevant step.

If route validation fails after D1 traffic is live, set `D1_CUTOVER_READY=false`
to block newer deploys and revert the D1 cutover stack to the last
Postgres/Hyperdrive deployment.
