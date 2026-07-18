import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrowdReportIdempotencyConflictError } from '~/util/crowdReports';
import { handleProgrammaticCrowdReportPost } from './internal.api.crowd-reports';

const ENVIRONMENT = {
  CROWD_REPORT_PRODUCERS: JSON.stringify({
    'reddit-monitor': {
      token: 'reddit-monitor-secret',
      sourceOrigins: ['https://www.reddit.com'],
    },
  }),
};

const VALID_BODY = {
  externalReportId: 'opaque-post-id',
  sourceUrl: 'https://www.reddit.com/r/singapore/comments/example',
  report: {
    reportScope: 'line',
    lineIds: ['CCL'],
    stationIds: [],
    effect: 'delay',
    delayMinutes: 10,
    isStillHappening: true,
  },
};

function makeRequest(body: unknown, token = 'reddit-monitor-secret') {
  return new Request('https://example.com/internal/api/crowd-reports', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function makeDependencies() {
  const db = {};
  return {
    db,
    getDb: vi.fn(() => db),
    purgePublicDataCache: vi.fn().mockResolvedValue({ status: 'purged' }),
    triggerCrowdReportDispatchAfterSubmission: vi.fn(),
    findMissingCrowdReportReferences: vi.fn().mockResolvedValue({
      lineIds: [],
      stationIds: [],
      directionStationIds: [],
    }),
    findProgrammaticCrowdReportRetry: vi.fn().mockResolvedValue(undefined),
    persistAutomoderatedProgrammaticCrowdReport: vi.fn().mockResolvedValue({
      id: 'report-1',
      status: 'accepted',
      duplicateOfId: null,
      created: true,
    }),
  };
}

describe('POST /internal/api/crowd-reports', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid authentication before parsing or accessing the database', async () => {
    const dependencies = makeDependencies();
    const response = await handleProgrammaticCrowdReportPost(
      makeRequest('{invalid-json', 'wrong-secret-value'),
      ENVIRONMENT,
      dependencies as never,
    );

    expect(response.status).toBe(401);
    expect(dependencies.getDb).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Unauthorized',
    });
  });

  it('rejects malformed reports and missing references', async () => {
    const malformedDependencies = makeDependencies();
    const malformedResponse = await handleProgrammaticCrowdReportPost(
      makeRequest({ ...VALID_BODY, report: { effect: 'delay' } }),
      ENVIRONMENT,
      malformedDependencies as never,
    );
    expect(malformedResponse.status).toBe(400);
    expect(
      malformedDependencies.persistAutomoderatedProgrammaticCrowdReport,
    ).not.toHaveBeenCalled();

    const missingDependencies = makeDependencies();
    missingDependencies.findMissingCrowdReportReferences.mockResolvedValue({
      lineIds: ['CCL'],
      stationIds: [],
      directionStationIds: [],
    });
    const missingResponse = await handleProgrammaticCrowdReportPost(
      makeRequest(VALID_BODY),
      ENVIRONMENT,
      missingDependencies as never,
    );
    expect(missingResponse.status).toBe(400);
    await expect(missingResponse.json()).resolves.toMatchObject({
      error: 'Invalid affected line or station',
      missingReferences: { lineIds: ['CCL'] },
    });
  });

  it('creates a report and triggers dispatch and cache invalidation once', async () => {
    const dependencies = makeDependencies();
    const response = await handleProgrammaticCrowdReportPost(
      makeRequest(VALID_BODY),
      ENVIRONMENT,
      dependencies as never,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'report-1',
        status: 'accepted',
        duplicateOfId: null,
        idempotentReplay: false,
      },
    });
    expect(
      dependencies.persistAutomoderatedProgrammaticCrowdReport,
    ).toHaveBeenCalledWith(
      dependencies.db,
      expect.objectContaining({ lineIds: ['CCL'], effect: 'delay' }),
      expect.objectContaining({
        producer: 'reddit-monitor',
        externalReportId: 'opaque-post-id',
        sourceUrl: 'https://www.reddit.com/r/singapore/comments/example',
        requestPayloadDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(
      dependencies.triggerCrowdReportDispatchAfterSubmission,
    ).toHaveBeenCalledOnce();
    expect(dependencies.purgePublicDataCache).toHaveBeenCalledOnce();
  });

  it('returns an idempotent retry without validation side effects', async () => {
    const dependencies = makeDependencies();
    dependencies.findProgrammaticCrowdReportRetry.mockResolvedValue({
      id: 'report-1',
      status: 'accepted',
      duplicateOfId: null,
      created: false,
    });

    const response = await handleProgrammaticCrowdReportPost(
      makeRequest(VALID_BODY),
      ENVIRONMENT,
      dependencies as never,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 'report-1', idempotentReplay: true },
    });
    expect(
      dependencies.findMissingCrowdReportReferences,
    ).not.toHaveBeenCalled();
    expect(
      dependencies.persistAutomoderatedProgrammaticCrowdReport,
    ).not.toHaveBeenCalled();
    expect(
      dependencies.triggerCrowdReportDispatchAfterSubmission,
    ).not.toHaveBeenCalled();
    expect(dependencies.purgePublicDataCache).not.toHaveBeenCalled();
  });

  it('returns 409 for a conflicting retry', async () => {
    const dependencies = makeDependencies();
    dependencies.findProgrammaticCrowdReportRetry.mockRejectedValue(
      new CrowdReportIdempotencyConflictError('report-1'),
    );

    const response = await handleProgrammaticCrowdReportPost(
      makeRequest(VALID_BODY),
      ENVIRONMENT,
      dependencies as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'externalReportId was already used with a different payload',
      reportId: 'report-1',
    });
  });

  it('rejects source URLs outside the authenticated producer policy', async () => {
    const dependencies = makeDependencies();
    const response = await handleProgrammaticCrowdReportPost(
      makeRequest({ ...VALID_BODY, sourceUrl: 'https://example.com/post' }),
      ENVIRONMENT,
      dependencies as never,
    );

    expect(response.status).toBe(400);
    expect(dependencies.getDb).not.toHaveBeenCalled();
  });
});
