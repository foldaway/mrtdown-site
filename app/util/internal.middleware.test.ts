import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureCrowdReportDispatchRequestFailure } from './crowdReportDispatchDiagnostics';
import { internalMiddleware } from './internal.middleware';

vi.mock('@tanstack/react-start', () => ({
  createMiddleware: () => ({ server: (handler: unknown) => handler }),
}));
vi.mock('./crowdReportDispatchDiagnostics', () => ({
  captureCrowdReportDispatchRequestFailure: vi.fn(),
}));

const authenticate = internalMiddleware as unknown as (context: {
  request: Request;
  next: () => Promise<Response>;
}) => Promise<Response>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEV', false);
  vi.stubEnv('INTERNAL_API_TOKENS', 'first-secret, second-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('internal request authentication diagnostics', () => {
  it.each([
    [undefined, 'missing_authorization'],
    ['Basic invalid', 'invalid_bearer'],
    ['Bearer wrong-secret', 'token_mismatch'],
    ['Bearer REDACTED:placeholder', 'token_mismatch'],
  ])(
    'reports a rejected credential without changing the 401 response: %s',
    async (authorization, reason) => {
      const request = new Request(
        'https://www.mrtdown.org/internal/api/tasks/crowd-report-dispatch',
        { headers: authorization == null ? {} : { authorization } },
      );
      const next = vi.fn();
      const response = await authenticate({ request, next });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
      expect(captureCrowdReportDispatchRequestFailure).toHaveBeenCalledWith(
        request,
        {
          status: 401,
          reason,
        },
      );
    },
  );

  it('continues to accept any configured bearer token without reporting a failure', async () => {
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const response = await authenticate({
      request: new Request(
        'https://www.mrtdown.org/internal/api/tasks/crowd-report-dispatch',
        {
          headers: { authorization: 'bearer second-secret' },
        },
      ),
      next,
    });
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
    expect(captureCrowdReportDispatchRequestFailure).not.toHaveBeenCalled();
  });
});
