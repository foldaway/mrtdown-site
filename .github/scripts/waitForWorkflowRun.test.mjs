import { describe, expect, it, vi } from 'vitest';
import { waitForWorkflowRun } from './waitForWorkflowRun.mjs';

describe('waitForWorkflowRun', () => {
  it('waits until a workflow succeeds', async () => {
    const logs = vi
      .fn()
      .mockResolvedValueOnce({ runs: [], cursor: '' })
      .mockResolvedValueOnce({
        runs: [{ workflowRunId: 'wfr_test', workflowState: 'RUN_SUCCESS' }],
        cursor: '',
      });

    await expect(
      waitForWorkflowRun({ logs }, 'wfr_test', {
        intervalMs: 0,
        sleep: vi.fn(),
        onPoll: vi.fn(),
      }),
    ).resolves.toMatchObject({ workflowState: 'RUN_SUCCESS' });
    expect(logs).toHaveBeenCalledTimes(2);
  });

  it('fails when a workflow fails', async () => {
    const logs = vi.fn().mockResolvedValue({
      runs: [{ workflowRunId: 'wfr_test', workflowState: 'RUN_FAILED' }],
      cursor: '',
    });

    await expect(
      waitForWorkflowRun({ logs }, 'wfr_test', {
        intervalMs: 0,
        sleep: vi.fn(),
        onPoll: vi.fn(),
      }),
    ).rejects.toThrow('ended with RUN_FAILED');
  });
});
