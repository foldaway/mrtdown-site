import * as Sentry from '@sentry/cloudflare';
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
import handler from '@tanstack/react-start/server-entry';

const wrappedFetch = wrapFetchWithSentry({
  fetch(request) {
    return handler.fetch(request);
  },
});

export { PullWorkflow } from './workflows/pull';

const SCHEDULED_PULL_SLOT_MS = 30 * 60 * 1000;
const SCHEDULED_PULL_LOOKBACK_SLOTS = 48;
const ACTIVE_WORKFLOW_STATUSES = new Set([
  'queued',
  'running',
  'paused',
  'waiting',
  'waitingForPause',
]);

function scheduledPullWorkflowId(scheduledTime: number) {
  const slot = Math.floor(scheduledTime / SCHEDULED_PULL_SLOT_MS);
  return `pull-scheduled-${slot}`;
}

async function hasActiveScheduledPullWorkflow(
  workflow: Env['PULL_WORKFLOW'],
  scheduledTime: number,
) {
  const currentSlot = Math.floor(scheduledTime / SCHEDULED_PULL_SLOT_MS);
  for (let offset = 0; offset < SCHEDULED_PULL_LOOKBACK_SLOTS; offset++) {
    const id = `pull-scheduled-${currentSlot - offset}`;
    try {
      const status = await workflow.get(id).then((instance) => {
        return instance.status();
      });
      if (offset === 0 && status.status !== 'unknown') {
        console.log(
          `Skipping scheduled pull; workflow ${id} already exists with ${status.status} status`,
        );
        return true;
      }
      if (ACTIVE_WORKFLOW_STATUSES.has(status.status)) {
        console.log(
          `Skipping scheduled pull; workflow ${id} is ${status.status}`,
        );
        return true;
      }
    } catch {
      // Missing instance IDs are expected while scanning recent cron slots.
    }
  }
  return false;
}

export default Sentry.withSentry(
  (env) => {
    return {
      dsn: env.SENTRY_DSN ?? '',
      environment: env.TIER ?? 'development',
    };
  },
  {
    fetch: wrappedFetch.fetch,
    async scheduled(event, env, ctx) {
      const workflow = env.PULL_WORKFLOW;
      if (workflow == null) {
        return;
      }

      if (await hasActiveScheduledPullWorkflow(workflow, event.scheduledTime)) {
        return;
      }

      ctx.waitUntil(
        workflow
          .create({
            id: scheduledPullWorkflowId(event.scheduledTime),
          })
          .catch((error) => {
            console.error('Scheduled pull workflow creation failed', { error });
            event.noRetry();
          }),
      );
    },
  } satisfies ExportedHandler<Env>,
);
