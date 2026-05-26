import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduledMocks = vi.hoisted(() => {
  return {
    dispatchPendingCrowdReports: vi.fn(),
    getDb: vi.fn(),
  };
});

vi.mock('../db/index.js', () => {
  return { getDb: scheduledMocks.getDb };
});

vi.mock('../util/crowdReportDispatch.js', () => {
  return {
    dispatchPendingCrowdReports: scheduledMocks.dispatchPendingCrowdReports,
  };
});

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

beforeEach(() => {
  scheduledMocks.dispatchPendingCrowdReports.mockReset();
  scheduledMocks.getDb.mockReset();
});

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
    expect(scheduledMocks.dispatchPendingCrowdReports).not.toHaveBeenCalled();
  });

  it('dispatches crowd reports on pull cron triggers when configured', async () => {
    const scheduledTime = Date.UTC(2026, 4, 1);
    const pullWorkflow = createWorkflow({});
    const publicHolidaysWorkflow = createWorkflow({});
    const fakeDb = {};
    scheduledMocks.getDb.mockReturnValue(fakeDb);
    scheduledMocks.dispatchPendingCrowdReports.mockResolvedValue({
      success: true,
      count: 2,
      dispatched: 2,
      failed: 0,
      results: [],
    });
    const { ctx, pending } = createExecutionContext();

    await handleScheduledWorkflows(
      createScheduledEvent(scheduledTime, PULL_CRON),
      {
        PULL_WORKFLOW: pullWorkflow.workflow,
        PUBLIC_HOLIDAYS_WORKFLOW: publicHolidaysWorkflow.workflow,
        VITE_ROOT_URL: 'https://mrtdown.example',
        CROWD_REPORT_DISPATCH_GITHUB_TOKEN: 'github-token',
        CROWD_REPORT_DISPATCH_GITHUB_OWNER: 'foldaway',
        CROWD_REPORT_DISPATCH_GITHUB_REPO: 'mrtdown-data',
        CROWD_REPORT_DISPATCH_GITHUB_EVENT_TYPE: 'ingest',
        CROWD_REPORT_DISPATCH_LIMIT: '3',
      } as unknown as Env,
      ctx,
    );
    await Promise.all(pending);

    expect(scheduledMocks.dispatchPendingCrowdReports).toHaveBeenCalledWith(
      fakeDb,
      {
        rootUrl: 'https://mrtdown.example',
        token: 'github-token',
        limit: 3,
        owner: 'foldaway',
        repo: 'mrtdown-data',
        eventType: 'ingest',
      },
    );
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
