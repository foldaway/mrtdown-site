import { describe, expect, it, vi } from 'vitest';
import { handleScheduledWorkflows } from './scheduled';

type WorkflowStatus = Awaited<ReturnType<WorkflowInstance['status']>>['status'];

const PULL_CRON = '*/30 * * * *';
const PUBLIC_HOLIDAYS_CRON = '0 18 * * SUN';

function scheduledPublicHolidaysWorkflowId(scheduledTime: number) {
  return `public-holidays-scheduled-${scheduledTime}`;
}

function createScheduledEvent(
  scheduledTime: number,
  cron = PUBLIC_HOLIDAYS_CRON,
) {
  return {
    scheduledTime,
    cron,
    noRetry: vi.fn(),
  } satisfies ScheduledController;
}

function createExecutionContext() {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
    passThroughOnException() {},
    exports: {},
    props: {},
  } as ExecutionContext;

  return { ctx, pending };
}

function createWorkflow(statuses: Record<string, WorkflowStatus | 'missing'>) {
  const createdIds: string[] = [];
  const workflow = {
    get: vi.fn(async (id: string) => {
      const status = statuses[id];
      if (status == null || status === 'missing') {
        const error = new Error(`Workflow ${id} not found`);
        Object.assign(error, { status: 404 });
        throw error;
      }
      return {
        status: async () => {
          return { status };
        },
      } as WorkflowInstance;
    }),
    create: vi.fn(async ({ id }: WorkflowInstanceCreateOptions) => {
      if (id != null) {
        createdIds.push(id);
      }
      return {} as WorkflowInstance;
    }),
  } as unknown as Workflow;

  return { createdIds, workflow };
}

describe('handleScheduledWorkflows', () => {
  it('routes pull cron triggers to the pull workflow', async () => {
    const scheduledTime = Date.UTC(2026, 4, 1);
    const pullWorkflow = createWorkflow({});
    const publicHolidaysWorkflow = createWorkflow({});
    const { ctx, pending } = createExecutionContext();

    await handleScheduledWorkflows(
      createScheduledEvent(scheduledTime, PULL_CRON),
      {
        PULL_WORKFLOW: pullWorkflow.workflow,
        PUBLIC_HOLIDAYS_WORKFLOW: publicHolidaysWorkflow.workflow,
      } as Env,
      ctx,
    );
    await Promise.all(pending);

    expect(pullWorkflow.createdIds).toEqual([
      `pull-scheduled-${Math.floor(scheduledTime / (30 * 60 * 1000))}`,
    ]);
    expect(publicHolidaysWorkflow.createdIds).toEqual([]);
  });

  it('creates a retry public holidays workflow when the scheduled instance errored', async () => {
    const scheduledTime = Date.UTC(2026, 4, 1);
    const workflowId = scheduledPublicHolidaysWorkflowId(scheduledTime);
    const { createdIds, workflow } = createWorkflow({
      [workflowId]: 'errored',
    });
    const { ctx, pending } = createExecutionContext();

    await handleScheduledWorkflows(
      createScheduledEvent(scheduledTime),
      {
        PULL_WORKFLOW: createWorkflow({}).workflow,
        PUBLIC_HOLIDAYS_WORKFLOW: workflow,
      } as Env,
      ctx,
    );
    await Promise.all(pending);

    expect(createdIds).toEqual([
      `public-holidays-scheduled-retry-${scheduledTime}`,
    ]);
  });

  it('skips public holidays workflow creation when the scheduled instance completed', async () => {
    const scheduledTime = Date.UTC(2026, 4, 1);
    const workflowId = scheduledPublicHolidaysWorkflowId(scheduledTime);
    const { createdIds, workflow } = createWorkflow({
      [workflowId]: 'complete',
    });
    const { ctx, pending } = createExecutionContext();

    await handleScheduledWorkflows(
      createScheduledEvent(scheduledTime),
      {
        PULL_WORKFLOW: createWorkflow({}).workflow,
        PUBLIC_HOLIDAYS_WORKFLOW: workflow,
      } as Env,
      ctx,
    );
    await Promise.all(pending);

    expect(createdIds).toEqual([]);
  });

  it('ignores unknown cron triggers', async () => {
    const scheduledTime = Date.UTC(2026, 4, 1);
    const pullWorkflow = createWorkflow({});
    const publicHolidaysWorkflow = createWorkflow({});
    const { ctx, pending } = createExecutionContext();

    await handleScheduledWorkflows(
      createScheduledEvent(scheduledTime, '15 3 * * *'),
      {
        PULL_WORKFLOW: pullWorkflow.workflow,
        PUBLIC_HOLIDAYS_WORKFLOW: publicHolidaysWorkflow.workflow,
      } as Env,
      ctx,
    );
    await Promise.all(pending);

    expect(pullWorkflow.createdIds).toEqual([]);
    expect(publicHolidaysWorkflow.createdIds).toEqual([]);
  });
});
