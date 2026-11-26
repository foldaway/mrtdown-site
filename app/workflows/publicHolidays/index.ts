import { createWorkflow } from '@upstash/workflow/tanstack';
import { eq } from 'drizzle-orm';
import { getDb } from '~/db/index.js';
import { metadataTable } from '~/db/schema.js';
import { purgePublicDataCache } from '~/util/cloudflareCache.js';
import { rebuildOperationalFactsForDates } from '~/util/dbQueries/operationalFacts.js';
import { publishRangeSnapshot } from '~/util/rangeSnapshot.server.js';
import { publishStationProfileSnapshot } from '~/util/stationProfileSnapshot.server';
import {
  assertPullWorkflowLease,
  releasePullWorkflowLease,
} from '../pull/helpers/workflowLease.js';
import {
  assertPublicHolidaySyncToken,
  canSkipPublicHolidaySync,
  completePublicHolidaySync,
} from './helpers/syncCheckpoint.js';
import {
  fetchDataGovPublicHolidays,
  PENDING_HOLIDAY_DATES_KEY,
  syncPublicHolidays,
  withPublicHolidayLease,
} from './helpers/syncPublicHolidays.js';

type Params = Record<string, never>;

export const publicHolidaysWorkflow = createWorkflow<Params, void>(
  async (context) => {
    const source = await context.run(
      'check-published-public-holidays',
      async () => {
        const rows = await fetchDataGovPublicHolidays();
        return { rows, unchanged: await canSkipPublicHolidaySync(rows) };
      },
    );
    if (source.unchanged) return;

    const syncResult = await context.run('sync-public-holidays', () =>
      syncPublicHolidays(getDb(), source.rows, context.workflowRunId),
    );

    const facts = await context.run(
      'rebuild-public-holiday-operational-facts',
      () =>
        withPublicHolidayLease(getDb(), context.workflowRunId, async () => {
          await assertPublicHolidaySyncToken(syncResult.checkpointToken);
          if (syncResult.changedDates.length === 0) return [];
          return rebuildOperationalFactsForDates(syncResult.changedDates);
        }),
    );

    await context.run('publish-public-holiday-cache', () => {
      const db = getDb();
      return withPublicHolidayLease(db, context.workflowRunId, async () => {
        await assertPublicHolidaySyncToken(syncResult.checkpointToken);
        // Pending dates survive committed writes and are cleared only after all
        // effects succeed, so a new run repairs even now-unchanged SQL rows.
        if (
          syncResult.changedDates.length > 0 ||
          Boolean(process.env.REDIS_URL)
        ) {
          await publishRangeSnapshot();
          await publishStationProfileSnapshot(
            undefined,
            syncResult.changedDates,
          );
          await purgePublicDataCache();
        }
        // Publication can take time; never clear repair dates after losing the
        // lease to another writer, even if this workflow later resumes.
        await assertPullWorkflowLease(db, context.workflowRunId);
        await assertPublicHolidaySyncToken(syncResult.checkpointToken);
        await db
          .delete(metadataTable)
          .where(eq(metadataTable.key, PENDING_HOLIDAY_DATES_KEY));
        await completePublicHolidaySync(
          syncResult.checkpointToken,
          source.rows,
        );
        await releasePullWorkflowLease(db, context.workflowRunId);
      });
    });

    console.log('[PUBLIC_HOLIDAYS] Sync complete', {
      ...syncResult,
      factsRebuilt: facts.length,
    });
  },
);
