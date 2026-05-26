import { getDb } from '../db/index.js';
import { dispatchPendingCrowdReports } from '../util/crowdReportDispatch.js';

const SCHEDULED_PULL_SLOT_MS = 30 * 60 * 1000;
const SCHEDULED_PULL_LOOKBACK_SLOTS = 48;
const SCHEDULED_PULL_CRONS = new Set(['*/30 * * * *', '0 * * * *']);
const SCHEDULED_PUBLIC_HOLIDAYS_CRON = '0 18 * * SUN';
const ACTIVE_WORKFLOW_STATUSES = new Set([
  'queued',
  'running',
  'paused',
  'waiting',
  'waitingForPause',
]);
const COMPLETED_WORKFLOW_STATUSES = new Set(['complete']);
const RETRYABLE_WORKFLOW_STATUSES = new Set(['errored', 'terminated']);

type CrowdReportDispatchScheduledEnv = Env & {
  CROWD_REPORT_DISPATCH_GITHUB_TOKEN?: string;
  CROWD_REPORT_DISPATCH_GITHUB_OWNER?: string;
  CROWD_REPORT_DISPATCH_GITHUB_REPO?: string;
  CROWD_REPORT_DISPATCH_GITHUB_EVENT_TYPE?: string;
  CROWD_REPORT_DISPATCH_LIMIT?: string;
};

function scheduledPullWorkflowId(scheduledTime: number) {
  const slot = Math.floor(scheduledTime / SCHEDULED_PULL_SLOT_MS);
  return `pull-scheduled-${slot}`;
}

function scheduledPublicHolidaysWorkflowId(scheduledTime: number) {
  return `public-holidays-scheduled-${scheduledTime}`;
}

function scheduledPublicHolidaysRetryWorkflowId(scheduledTime: number) {
  return `public-holidays-scheduled-retry-${scheduledTime}`;
}

function getErrorField(error: unknown, field: 'code' | 'status') {
  if (typeof error !== 'object' || error == null || !(field in error)) {
    return null;
  }
  const value = error[field as keyof typeof error];
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}

function isMissingWorkflowInstanceError(error: unknown) {
  const code = getErrorField(error, 'code');
  const status = getErrorField(error, 'status');
  const message = error instanceof Error ? error.message : String(error);

  // Cloudflare Workflows currently surfaces missing instance lookups from
  // instance.status(); keep the matcher explicit so live response drift is
  // visible in logs instead of being treated as safe to ignore.
  return (
    status === 404 ||
    code === 404 ||
    code === 'not_found' ||
    /not\s*found|unknown instance|does not exist/i.test(message)
  );
}

function getScheduledCrowdReportDispatchLimit(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
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
    } catch (error) {
      if (isMissingWorkflowInstanceError(error)) {
        continue;
      }
      console.error(`Scheduled pull lookup failed for workflow ${id}`, {
        error,
      });
      return true;
    }
  }
  return false;
}

async function getScheduledPublicHolidaysWorkflowId(
  workflow: Env['PUBLIC_HOLIDAYS_WORKFLOW'],
  scheduledTime: number,
) {
  const id = scheduledPublicHolidaysWorkflowId(scheduledTime);
  try {
    const status = await workflow.get(id).then((instance) => {
      return instance.status();
    });
    if (
      ACTIVE_WORKFLOW_STATUSES.has(status.status) ||
      COMPLETED_WORKFLOW_STATUSES.has(status.status)
    ) {
      console.log(
        `Skipping scheduled public holidays sync; workflow ${id} already exists with ${status.status} status`,
      );
      return null;
    }
    if (RETRYABLE_WORKFLOW_STATUSES.has(status.status)) {
      const retryId = scheduledPublicHolidaysRetryWorkflowId(scheduledTime);
      console.warn(
        `Retrying scheduled public holidays sync; workflow ${id} is ${status.status}, creating ${retryId}`,
      );
      return retryId;
    }
  } catch (error) {
    if (isMissingWorkflowInstanceError(error)) {
      return id;
    }
    console.error(
      `Scheduled public holidays lookup failed for workflow ${id}`,
      {
        error,
      },
    );
    return null;
  }
  return id;
}

export async function handleScheduledWorkflows(
  event: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
) {
  if (SCHEDULED_PULL_CRONS.has(event.cron)) {
    await handleScheduledPullWorkflow(event, env, ctx);
    handleScheduledCrowdReportDispatch(event, env, ctx);
    return;
  }

  if (event.cron === SCHEDULED_PUBLIC_HOLIDAYS_CRON) {
    await handleScheduledPublicHolidaysWorkflow(event, env, ctx);
    return;
  }

  console.warn(`Ignoring unknown scheduled cron trigger: ${event.cron}`);
}

function handleScheduledCrowdReportDispatch(
  event: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
) {
  const runtimeEnv = env as CrowdReportDispatchScheduledEnv;
  const token = runtimeEnv.CROWD_REPORT_DISPATCH_GITHUB_TOKEN;
  if (!token) {
    return;
  }

  const rootUrl = runtimeEnv.VITE_ROOT_URL;
  if (!rootUrl) {
    console.warn(
      'Skipping scheduled crowd report dispatch; VITE_ROOT_URL is missing',
    );
    return;
  }

  ctx.waitUntil(
    dispatchPendingCrowdReports(getDb(), {
      rootUrl,
      token,
      limit: getScheduledCrowdReportDispatchLimit(
        runtimeEnv.CROWD_REPORT_DISPATCH_LIMIT,
      ),
      owner: runtimeEnv.CROWD_REPORT_DISPATCH_GITHUB_OWNER,
      repo: runtimeEnv.CROWD_REPORT_DISPATCH_GITHUB_REPO,
      eventType: runtimeEnv.CROWD_REPORT_DISPATCH_GITHUB_EVENT_TYPE,
    })
      .then((result) => {
        if (result.count === 0) {
          return;
        }
        console.log('Scheduled crowd report dispatch complete', {
          dispatched: result.dispatched,
          failed: result.failed,
        });
      })
      .catch((error) => {
        console.error('Scheduled crowd report dispatch failed', { error });
        event.noRetry();
      }),
  );
}

async function handleScheduledPullWorkflow(
  event: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
) {
  const workflow = env.PULL_WORKFLOW;
  if (workflow == null) {
    return;
  }

  if (!(await hasActiveScheduledPullWorkflow(workflow, event.scheduledTime))) {
    ctx.waitUntil(
      workflow
        .create({
          id: scheduledPullWorkflowId(event.scheduledTime),
        })
        .catch((error) => {
          console.error('Scheduled pull workflow creation failed', {
            error,
          });
          event.noRetry();
        }),
    );
  }
}

async function handleScheduledPublicHolidaysWorkflow(
  event: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
) {
  const publicHolidaysWorkflow = env.PUBLIC_HOLIDAYS_WORKFLOW;
  if (publicHolidaysWorkflow == null) {
    return;
  }

  const publicHolidaysWorkflowId = await getScheduledPublicHolidaysWorkflowId(
    publicHolidaysWorkflow,
    event.scheduledTime,
  );
  if (publicHolidaysWorkflowId == null) {
    return;
  }

  ctx.waitUntil(
    publicHolidaysWorkflow
      .create({
        id: publicHolidaysWorkflowId,
      })
      .catch((error) => {
        console.error('Scheduled public holidays workflow creation failed', {
          error,
        });
        event.noRetry();
      }),
  );
}
