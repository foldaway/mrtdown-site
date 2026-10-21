import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { triggerCrowdReportDispatchAfterSubmission } from './crowdReportDispatch';
import { captureCrowdReportDispatchAfterSubmissionFailure } from './crowdReportDispatchDiagnostics';

vi.mock('./crowdReportDispatchDiagnostics', () => ({
  captureCrowdReportDispatchAfterSubmissionFailure: vi.fn(),
}));

const ENVIRONMENT = {
  VITE_ROOT_URL: 'https://www.mrtdown.org',
  CROWD_REPORT_DISPATCH_GITHUB_TOKEN: 'github-secret',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('immediate dispatch Sentry reporting', () => {
  it('keeps dispatch in the background and does not report successful runs', async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const dispatch = vi.fn().mockReturnValue(pending);
    expect(
      triggerCrowdReportDispatchAfterSubmission(
        {} as never,
        ENVIRONMENT,
        dispatch,
      ),
    ).toBe(true);
    expect(
      captureCrowdReportDispatchAfterSubmissionFailure,
    ).not.toHaveBeenCalled();
    finish({ success: true, count: 1, dispatched: 1, failed: 0, results: [] });
    await pending;
    expect(
      captureCrowdReportDispatchAfterSubmissionFailure,
    ).not.toHaveBeenCalled();
  });

  it.each([
    [{}, ['VITE_ROOT_URL', 'CROWD_REPORT_DISPATCH_GITHUB_TOKEN']],
    [
      { VITE_ROOT_URL: ENVIRONMENT.VITE_ROOT_URL },
      ['CROWD_REPORT_DISPATCH_GITHUB_TOKEN'],
    ],
    [
      {
        CROWD_REPORT_DISPATCH_GITHUB_TOKEN:
          ENVIRONMENT.CROWD_REPORT_DISPATCH_GITHUB_TOKEN,
      },
      ['VITE_ROOT_URL'],
    ],
  ])(
    'reports why immediate dispatch could not start: %j',
    (environment, missingConfiguration) => {
      const dispatch = vi.fn();
      expect(
        triggerCrowdReportDispatchAfterSubmission(
          {} as never,
          environment,
          dispatch,
        ),
      ).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
      expect(
        captureCrowdReportDispatchAfterSubmissionFailure,
      ).toHaveBeenCalledExactlyOnceWith({
        reason: 'missing_configuration',
        missingConfiguration,
      });
    },
  );

  it('reports one summary for a run with failed candidates', async () => {
    const dispatch = vi.fn().mockResolvedValue({
      success: false,
      count: 3,
      dispatched: 1,
      failed: 2,
      results: [
        { kind: 'cluster', id: 'c1', success: true },
        {
          kind: 'cluster',
          id: 'c2',
          success: false,
          error: 'private-response-1',
        },
        {
          kind: 'report',
          id: 'r1',
          success: false,
          error: 'private-response-2',
        },
      ],
    });
    expect(
      triggerCrowdReportDispatchAfterSubmission(
        {} as never,
        ENVIRONMENT,
        dispatch,
      ),
    ).toBe(true);
    await vi.waitFor(() =>
      expect(
        captureCrowdReportDispatchAfterSubmissionFailure,
      ).toHaveBeenCalledExactlyOnceWith({
        reason: 'dispatch_failed',
        candidateCount: 3,
        failedCount: 2,
      }),
    );
  });

  it.each([new Error('private-error'), 'private-thrown-value'])(
    'reports rejected background dispatches without an unhandled rejection: %s',
    async (error) => {
      const dispatch = vi.fn().mockRejectedValue(error);
      expect(
        triggerCrowdReportDispatchAfterSubmission(
          {} as never,
          ENVIRONMENT,
          dispatch,
        ),
      ).toBe(true);
      await vi.waitFor(() =>
        expect(
          captureCrowdReportDispatchAfterSubmissionFailure,
        ).toHaveBeenCalledExactlyOnceWith({
          reason: 'dispatch_exception',
          error,
        }),
      );
    },
  );
});
