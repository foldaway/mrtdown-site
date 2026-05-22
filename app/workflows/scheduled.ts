const SCHEDULED_PULL_SLOT_MS = 30 * 60 * 1000;
const SCHEDULED_PULL_LOOKBACK_SLOTS = 48;
const SCHEDULED_PUBLIC_HOLIDAYS_SLOT_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_WORKFLOW_STATUSES = new Set([
  'queued',
  'running',
  'paused',
  'waiting',
  'waitingForPause',
]);
const COMPLETED_WORKFLOW_STATUSES = new Set(['complete']);
const RETRYABLE_WORKFLOW_STATUSES = new Set(['errored', 'terminated']);

function scheduledPullWorkflowId(scheduledTime: number) {
  const slot = Math.floor(scheduledTime / SCHEDULED_PULL_SLOT_MS);
  return `pull-scheduled-${slot}`;
}

function scheduledPublicHolidaysWorkflowId(scheduledTime: number) {
  const slot = Math.floor(scheduledTime / SCHEDULED_PUBLIC_HOLIDAYS_SLOT_MS);
  return `public-holidays-scheduled-${slot}`;
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
  const workflow = env.PULL_WORKFLOW;
  if (
    workflow != null &&
    !(await hasActiveScheduledPullWorkflow(workflow, event.scheduledTime))
  ) {
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
