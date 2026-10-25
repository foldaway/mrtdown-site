import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retentionReview } from '~/util/dbQueries/scheduledTimetableRetention.fixture';
import { getClient } from '~/workflows/client';
import { scheduledTimetableArchiveFixture } from '~/workflows/pull/helpers/scheduledTimetableArchive.fixture';
import { handlePullPost } from './internal.api.tasks.pull';

vi.mock('~/workflows/client', () => ({
  getClient: vi.fn(() => ({
    trigger: vi.fn().mockResolvedValue({ workflowRunId: 'pull-test' }),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_ROOT_URL', 'https://www.mrtdown.org');
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

  it.each([
    '{',
    'null',
    '{"importInstant":"2026-10-24T00:00:00Z"}',
    '{"sourceReview":{}}',
  ])('rejects invalid input before enqueueing: %s', async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });
});
