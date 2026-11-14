import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));

import { Route as legacyArrivals } from './api.stations.$stationId.arrivals';

type RetiredRoute = {
  options: { server: { handlers: Record<string, () => Response> } };
};
describe('retired frequency arrival APIs', () => {
  it('returns an uncached gone response', () => {
    const response = (
      legacyArrivals as unknown as RetiredRoute
    ).options.server.handlers.GET();
    expect(response.status).toBe(410);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
