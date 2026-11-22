import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retentionReview } from '~/util/dbQueries/scheduledTimetableRetention.fixture';
import { getClient } from '~/workflows/client';
import { scheduledTimetableArchiveFixture } from '~/workflows/pull/helpers/scheduledTimetableArchive.fixture';
import { handlePullGet, handlePullPost } from './internal.api.tasks.pull';

const { logs } = vi.hoisted(() => ({ logs: vi.fn() }));

vi.mock('~/workflows/client', () => ({
  getClient: vi.fn(() => ({
    trigger: vi.fn().mockResolvedValue({ workflowRunId: 'pull-test' }),
    logs,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_ROOT_URL', 'https://www.mrtdown.org');
  vi.stubEnv('PULL_WORKFLOW_URL', '');
});

describe('canonical pull completion receipt', () => {
  const workflowUrl = 'https://www.mrtdown.org/internal/api/workflows/pull';
  const combinedReleaseIndex = {
    manifestSha256: 'a'.repeat(64),
    releaseSha256: 'b'.repeat(64),
  };
  const get = (id = 'wfr_test') =>
    handlePullGet(
      new Request(
        `https://www.mrtdown.org/internal/api/tasks/pull?workflowRunId=${encodeURIComponent(id)}`,
      ),
    );

  it('rejects missing or invalid run identifiers before fetching logs', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('../other')).status).toBe(400);
    expect(logs).not.toHaveBeenCalled();
  });

  it('waits for new runs and filters the exact canonical pull URL', async () => {
    logs.mockResolvedValue({ runs: [] });
    const response = await get();
    expect(await response.json()).toEqual({
      workflowRunId: 'wfr_test',
      state: 'PENDING',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(logs).toHaveBeenCalledWith({
      filter: { workflowRunId: 'wfr_test', workflowUrl },
      count: 1,
    });
  });

  it('returns the completed release identity without exposing workflow logs', async () => {
    logs.mockResolvedValue({
      runs: [
        {
          workflowRunId: 'wfr_test',
          workflowUrl,
          workflowState: 'RUN_SUCCESS',
          workflowRunResponse: JSON.stringify({ combinedReleaseIndex }),
          steps: [{ secret: 'hidden' }],
        },
      ],
    });
    expect(await (await get()).json()).toEqual({
      workflowRunId: 'wfr_test',
      state: 'RUN_SUCCESS',
      combinedReleaseIndex,
    });
  });

  it.each(['RUN_STARTED', 'RUN_FAILED', 'RUN_CANCELED'])(
    'reports %s without claiming completion',
    async (state) => {
      logs.mockResolvedValue({
        runs: [
          { workflowRunId: 'wfr_test', workflowUrl, workflowState: state },
        ],
      });
      expect(await (await get()).json()).toEqual({
        workflowRunId: 'wfr_test',
        state,
        combinedReleaseIndex: null,
      });
    },
  );

  it('does not mistake another workflow for the requested pull', async () => {
    logs.mockResolvedValue({
      runs: [
        {
          workflowRunId: 'wfr_test',
          workflowUrl: 'https://www.mrtdown.org/other',
          workflowState: 'RUN_SUCCESS',
        },
      ],
    });
    expect((await (await get()).json()).state).toBe('PENDING');
  });

  it('fails closed for a malformed completed receipt', async () => {
    logs.mockResolvedValue({
      runs: [
        {
          workflowRunId: 'wfr_test',
          workflowUrl,
          workflowState: 'RUN_SUCCESS',
          workflowRunResponse: '{',
        },
      ],
    });
    expect((await get()).status).toBe(502);
  });

  it('recognizes runs at the direct origin and preserves old public receipts', async () => {
    const directUrl =
      'https://mrtdown-site.fly.dev/internal/api/workflows/pull';
    vi.stubEnv('PULL_WORKFLOW_URL', directUrl);
    logs.mockResolvedValueOnce({ runs: [] }).mockResolvedValueOnce({
      runs: [
        {
          workflowRunId: 'wfr_test',
          workflowUrl,
          workflowState: 'RUN_SUCCESS',
          workflowRunResponse: JSON.stringify({ combinedReleaseIndex }),
        },
      ],
    });
    expect((await (await get()).json()).combinedReleaseIndex).toEqual(
      combinedReleaseIndex,
    );
    expect(logs.mock.calls.map(([value]) => value.filter.workflowUrl)).toEqual([
      directUrl,
      workflowUrl,
    ]);
    logs.mockResolvedValueOnce({
      runs: [
        {
          workflowRunId: 'wfr_test',
          workflowUrl: directUrl,
          workflowState: 'RUN_STARTED',
        },
      ],
    });
    expect((await (await get()).json()).state).toBe('RUN_STARTED');
  });
});
afterEach(() => vi.unstubAllEnvs());

function post(body?: string) {
  return handlePullPost(
    new Request('https://www.mrtdown.org/internal/api/tasks/pull', {
      method: 'POST',
      body,
    }),
  );
}

describe('canonical pull trigger payload', () => {
  it('uses the configured direct origin for signed pull callbacks', async () => {
    const url = 'https://mrtdown-site.fly.dev/internal/api/workflows/pull';
    vi.stubEnv('PULL_WORKFLOW_URL', url);
    expect((await post('{}')).status).toBe(202);
    expect(
      vi.mocked(getClient).mock.results[0].value.trigger,
    ).toHaveBeenCalledWith(expect.objectContaining({ url }));
  });

  it.each([undefined, '{}'])(
    'accepts an empty pull request: %s',
    async (body) => {
      expect((await post(body)).status).toBe(202);
      expect(
        vi.mocked(getClient).mock.results[0].value.trigger,
      ).toHaveBeenCalledWith(expect.objectContaining({ body: {} }));
    },
  );

  it('forwards the explicit shared source review to the workflow', async () => {
    const sourceReview = retentionReview(scheduledTimetableArchiveFixture());
    expect((await post(JSON.stringify({ sourceReview }))).status).toBe(202);
    expect(
      vi.mocked(getClient).mock.results[0].value.trigger,
    ).toHaveBeenCalledWith(expect.objectContaining({ body: { sourceReview } }));
  });

  it('forwards a standalone Navigation cache seed to the workflow', async () => {
    expect((await post('{"seedNavigationCache":true}')).status).toBe(202);
    expect(
      vi.mocked(getClient).mock.results[0].value.trigger,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ body: { seedNavigationCache: true } }),
    );
  });

  it('forwards a standalone service-path seed without timetable inputs', async () => {
    expect((await post('{"seedServicePathCache":true}')).status).toBe(202);
    expect(
      vi.mocked(getClient).mock.results[0].value.trigger,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ body: { seedServicePathCache: true } }),
    );
  });

  it('forwards a standalone reference seed', async () => {
    expect((await post('{"seedRangeReferenceCache":true}')).status).toBe(202);
    expect(
      vi.mocked(getClient).mock.results[0].value.trigger,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ body: { seedRangeReferenceCache: true } }),
    );
  });

  it.each([
    '{',
    'null',
    '{"importInstant":"2026-10-24T00:00:00Z"}',
    '{"sourceReview":{}}',
    '{"seedNavigationCache":true,"rebuildScheduledTimetableProjection":true}',
    '{"seedServicePathCache":true,"rebuildScheduledTimetableProjection":true}',
    '{"seedServicePathCache":true,"seedNavigationCache":true}',
    '{"seedRangeReferenceCache":true,"seedServicePathCache":true}',
    '{"seedRangeReferenceCache":true,"seedNavigationCache":true}',
    '{"seedRangeReferenceCache":true,"rebuildScheduledTimetableProjection":true}',
    '{"seedRangeReferenceCache":true,"sourceReview":{}}',
  ])('rejects invalid input before enqueueing: %s', async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });
});
