import { describe, expect, it, vi } from 'vitest';
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
import { Route as legacyArrivals } from './api.stations.$stationId.arrivals';
import { Route as legacyReports } from './api.arrival-reports';

type RetiredRoute = {
  options: { server: { handlers: Record<string, () => Response> } };
};
describe('retired frequency arrival APIs', () => {
  it.each([
    [legacyArrivals, 'GET'],
    [legacyReports, 'POST'],
  ])(
    'returns an uncached gone response without estimating or recording reports',
    (route, method) => {
      const response = (
        route as unknown as RetiredRoute
      ).options.server.handlers[method as string]();
      expect(response.status).toBe(410);
      expect(response.headers.get('cache-control')).toBe('no-store');
    },
  );
});
