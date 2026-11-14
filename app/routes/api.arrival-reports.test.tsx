import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CrowdArrivalRateLimitError,
  InvalidCrowdArrivalScopeError,
  submitCrowdArrival,
} from '~/util/crowdArrivalReports';
import { Route } from './api.arrival-reports';

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock('~/db', () => ({ getDb: () => 'database' }));
vi.mock('~/util/crowdArrivalReports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/util/crowdArrivalReports')>()),
  submitCrowdArrival: vi.fn(),
}));

type ReportRoute = {
  options: {
    server: {
      handlers: { POST: (input: { request: Request }) => Promise<Response> };
    };
  };
};
const { POST } = (Route as unknown as ReportRoute).options.server.handlers;
const report = {
  stationId: 'TNM',
  lineId: 'EWL',
  serviceId: 'EWL_CG_E',
  destinationStationId: 'CGA',
  minutesToArrival: 1,
};
const submit = vi.mocked(submitCrowdArrival);

function request(body: unknown = report) {
  return POST({
    request: new Request('http://localhost/api/arrival-reports', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'fly-client-ip': '192.0.2.4',
      },
      body: JSON.stringify(body),
    }),
  });
}

describe('arrival report submissions', () => {
  beforeEach(() => {
    vi.stubEnv('CROWD_REPORT_HASH_SALT', 'test-report-salt');
    submit.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('accepts a branch report and exposes only success', async () => {
    const response = await request();
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ success: true });
    expect(submit).toHaveBeenCalledWith(
      'database',
      report,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('rejects client-supplied time or platform and enforces canonical scope and cooldown errors', async () => {
    expect((await request({ ...report, platformId: 'TNM_EWL_D' })).status).toBe(
      400,
    );
    expect(
      (await request({ ...report, reportedAt: '2026-11-14T08:00:00Z' })).status,
    ).toBe(400);
    expect(submit).not.toHaveBeenCalled();
    submit.mockRejectedValueOnce(new InvalidCrowdArrivalScopeError());
    expect((await request()).status).toBe(400);
    submit.mockRejectedValueOnce(new CrowdArrivalRateLimitError());
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
  });
});
