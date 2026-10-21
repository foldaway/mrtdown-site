import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '~/db';
import {
  dispatchPendingCrowdReports,
  getDispatchableCrowdReportCandidates,
} from '~/util/crowdReportDispatch';
import { captureCrowdReportDispatchRequestFailure } from '~/util/crowdReportDispatchDiagnostics';
import { handleCrowdReportDispatchPost } from './internal.api.tasks.crowd-report-dispatch';

vi.mock('~/db', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('~/util/crowdReportDispatch', () => ({
  dispatchPendingCrowdReports: vi.fn(),
  getDispatchableCrowdReportCandidates: vi.fn(),
  getCrowdReportDispatchLimit: () => 10,
}));
vi.mock('~/util/crowdReportDispatchDiagnostics', () => ({
  captureCrowdReportDispatchRequestFailure: vi.fn(),
}));

function request(body?: string) {
  return new Request(
    'https://www.mrtdown.org/internal/api/tasks/crowd-report-dispatch',
    {
      method: 'POST',
      body,
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_ROOT_URL', 'https://www.mrtdown.org');
  vi.stubEnv('CROWD_REPORT_DISPATCH_GITHUB_TOKEN', 'github-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('crowd report dispatch request diagnostics', () => {
  it('reports invalid JSON before accessing the database', async () => {
    const req = request('{malformed');
    const response = await handleCrowdReportDispatchPost(req);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid JSON request body',
    });
    expect(getDb).not.toHaveBeenCalled();
    expect(captureCrowdReportDispatchRequestFailure).toHaveBeenCalledWith(req, {
      status: 400,
      reason: 'invalid_json',
    });
  });

  it.each([
    '{"dryRun":"true"}',
    '{"kind":"invalid"}',
    '{"limit":0}',
    '{"unexpected":true}',
  ])(
    'reports request schema failures before accessing the database: %s',
    async (body) => {
      const req = request(body);
      const response = await handleCrowdReportDispatchPost(req);
      expect(response.status).toBe(400);
      expect(getDb).not.toHaveBeenCalled();
      expect(captureCrowdReportDispatchRequestFailure).toHaveBeenCalledWith(
        req,
        {
          status: 400,
          reason: 'invalid_request',
          issues: expect.any(Array),
        },
      );
    },
  );

  it.each([
    ['VITE_ROOT_URL', 'missing_root_url'],
    ['CROWD_REPORT_DISPATCH_GITHUB_TOKEN', 'missing_github_token'],
  ])('reports missing configuration: %s', async (variable, reason) => {
    vi.stubEnv(variable, '');
    const req = request();
    const response = await handleCrowdReportDispatchPost(req);
    expect(response.status).toBe(503);
    expect(dispatchPendingCrowdReports).not.toHaveBeenCalled();
    expect(captureCrowdReportDispatchRequestFailure).toHaveBeenCalledWith(req, {
      status: 503,
      reason,
    });
  });

  it('accepts a dry run without dispatching or reporting a failure', async () => {
    vi.mocked(getDispatchableCrowdReportCandidates).mockResolvedValue([]);
    const response = await handleCrowdReportDispatchPost(
      request('{"dryRun":true}'),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      dryRun: true,
      count: 0,
      candidates: [],
    });
    expect(dispatchPendingCrowdReports).not.toHaveBeenCalled();
    expect(captureCrowdReportDispatchRequestFailure).not.toHaveBeenCalled();
  });

  it.each([undefined, '{}'])(
    'preserves successful dispatch with default options: %s',
    async (body) => {
      vi.mocked(dispatchPendingCrowdReports).mockResolvedValue({
        success: true,
        count: 1,
        dispatched: 1,
        failed: 0,
        results: [],
      });
      const response = await handleCrowdReportDispatchPost(request(body));
      expect(response.status).toBe(202);
      expect(dispatchPendingCrowdReports).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: 'any',
          limit: 10,
          rootUrl: 'https://www.mrtdown.org',
          token: 'github-secret',
        }),
      );
      expect(captureCrowdReportDispatchRequestFailure).not.toHaveBeenCalled();
    },
  );

  it('reports handled dispatch failures without forwarding upstream error text to Sentry', async () => {
    const result = {
      success: false,
      count: 1,
      dispatched: 0,
      failed: 1,
      results: [
        {
          kind: 'report' as const,
          id: 'report-1',
          success: false,
          error: 'upstream-private-text',
        },
      ],
    };
    vi.mocked(dispatchPendingCrowdReports).mockResolvedValue(result);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      const req = request('{}');
      const response = await handleCrowdReportDispatchPost(req);
      expect(response.status).toBe(207);
      await expect(response.json()).resolves.toEqual(result);
      expect(captureCrowdReportDispatchRequestFailure).toHaveBeenCalledWith(
        req,
        {
          status: 207,
          reason: 'dispatch_failed',
          candidateCount: 1,
          failedCount: 1,
        },
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
