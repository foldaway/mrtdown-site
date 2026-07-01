import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import * as Sentry from '@sentry/cloudflare';
import { getDb } from '~/db/index.js';
import { rebuildOperationalFactsForDates } from '~/util/db/queries/facts.js';
import {
  clearPendingPublicHolidayRebuildDates,
  syncPublicHolidaysFromDataGov,
} from './helpers/syncPublicHolidays.js';

type Params = Record<string, never>;

const syncStepConfig = {
  retries: {
    limit: 3,
    delay: '5 seconds' as const,
    backoff: 'exponential' as const,
  },
  timeout: '2 minutes' as const,
};

const factsStepConfig = {
  retries: {
    limit: 2,
    delay: '10 seconds' as const,
    backoff: 'exponential' as const,
  },
  timeout: '10 minutes' as const,
};

class PublicHolidaysWorkflowBase extends WorkflowEntrypoint<Env, Params> {
  async run(_event: WorkflowEvent<Params>, step: WorkflowStep) {
    const syncResult = await step.do(
      'sync-public-holidays',
      syncStepConfig,
      async () => {
        const db = getDb();
        return syncPublicHolidaysFromDataGov(db);
      },
    );

    const facts = await step.do(
      'rebuild-public-holiday-operational-facts',
      factsStepConfig,
      async () => {
        if (syncResult.changedDates.length === 0) {
          return [];
        }
        const rebuilt = await rebuildOperationalFactsForDates(
          syncResult.changedDates,
        );
        const db = getDb();
        await clearPendingPublicHolidayRebuildDates(
          db,
          rebuilt.map((result) => result.date),
        );
        return rebuilt;
      },
    );

    console.log('[PUBLIC_HOLIDAYS] Sync complete', {
      ...syncResult,
      factsRebuilt: facts.length,
    });
  }
}

export const PublicHolidaysWorkflow = Sentry.instrumentWorkflowWithSentry(
  (env: Env) => {
    return {
      dsn: env.SENTRY_DSN ?? '',
      environment: env.TIER ?? 'development',
    };
  },
  PublicHolidaysWorkflowBase,
);
