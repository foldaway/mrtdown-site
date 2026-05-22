import { describe, expect, it, vi } from 'vitest';
import { handleScheduledWorkflows } from './scheduled';

type WorkflowStatus = Awaited<ReturnType<WorkflowInstance['status']>>['status'];

function scheduledPublicHolidaysWorkflowId(scheduledTime: number) {
  const slot = Math.floor(scheduledTime / (7 * 24 * 60 * 60 * 1000));
  return `public-holidays-scheduled-${slot}`;
}

function createScheduledEvent(scheduledTime: number) {
  return {
    scheduledTime,
    cron: '0 0 * * *',
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
  it('creates a retry public holidays workflow when the scheduled instance errored', async () => {
    const scheduledTime = Date.UTC(2026, 4, 1);
    const workflowId = scheduledPublicHolidaysWorkflowId(scheduledTime);
    const { createdIds, workflow } = createWorkflow({
      [workflowId]: 'errored',
    });
    const { ctx, pending } = createExecutionContext();

    await handleScheduledWorkflows(
      createScheduledEvent(scheduledTime),
      { PUBLIC_HOLIDAYS_WORKFLOW: workflow } as Env,
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
      { PUBLIC_HOLIDAYS_WORKFLOW: workflow } as Env,
      ctx,
    );
    await Promise.all(pending);

    expect(createdIds).toEqual([]);
  });
});
