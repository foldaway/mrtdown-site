import { createWorkflow } from '@upstash/workflow/tanstack';
import { getDb } from '~/db/index.js';
import { purgePublicDataCache } from '~/util/cloudflareCache.js';
import { rebuildOperationalFactsForDates } from '~/util/dbQueries/operationalFacts.js';
import { syncPublicHolidaysFromDataGov } from './helpers/syncPublicHolidays.js';

type Params = Record<string, never>;

export const publicHolidaysWorkflow = createWorkflow<Params, void>(
  async (context) => {
    const syncResult = await context.run('sync-public-holidays', async () => {
      const db = getDb();
      return syncPublicHolidaysFromDataGov(db);
    });

    const facts = await context.run(
      'rebuild-public-holiday-operational-facts',
      async () => {
        if (syncResult.changedDates.length === 0) {
          return [];
        }
        return rebuildOperationalFactsForDates(syncResult.changedDates);
      },
    );

    if (syncResult.changedDates.length > 0) {
      await context.run('publish-public-holiday-cache', () =>
        purgePublicDataCache(),
      );
    }

    console.log('[PUBLIC_HOLIDAYS] Sync complete', {
      ...syncResult,
      factsRebuilt: facts.length,
    });
  },
);
