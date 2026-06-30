import { describe, expect, it } from 'vitest';
import { getRouteCheckFailures } from './checkRouteTimings.js';

type RouteTimingResult = Parameters<typeof getRouteCheckFailures>[0][number];

function routeTimingResult(
  overrides: Partial<RouteTimingResult> = {},
): RouteTimingResult {
  return {
    appCache: '',
    bytes: 128,
    cacheControl: '',
    cfCacheStatus: '',
    contentType: 'text/html; charset=utf-8',
    expectedContentTypes: ['text/html'],
    expectedStatuses: [200],
    group: 'html',
    label: '/',
    render: '',
    route: '/',
    sample: 1,
    serverTiming: '',
    status: 200,
    totalMs: 20,
    ttfbMs: 10,
    ...overrides,
  };
}

describe('getRouteCheckFailures', () => {
  it('accepts successful responses with expected content types and parameters', () => {
    expect(
      getRouteCheckFailures([
        routeTimingResult({
          contentType: 'text/markdown; charset=utf-8',
          expectedContentTypes: ['text/markdown', 'text/plain'],
          group: 'markdown',
          label: 'overview index.md',
          route: '/index.md',
        }),
      ]),
    ).toEqual([]);
  });

  it('rejects successful responses with unexpected content types', () => {
    expect(
      getRouteCheckFailures([
        routeTimingResult({
          contentType: 'text/html; charset=utf-8',
          expectedContentTypes: ['application/xml', 'text/xml'],
          group: 'xml',
          label: 'sitemap.xml',
          route: '/sitemap.xml',
        }),
      ]),
    ).toEqual([
      'sitemap.xml sample 1 returned text/html; charset=utf-8; expected application/xml or text/xml',
    ]);
  });

  it('does not require content type checks for expected non-success statuses', () => {
    expect(
      getRouteCheckFailures([
        routeTimingResult({
          bytes: 0,
          contentType: 'text/html',
          expectedContentTypes: ['text/markdown'],
          expectedStatuses: [406],
          group: 'markdown',
          label: 'HTML route with Markdown Accept',
          route: '/lines/BPLRT',
          status: 406,
        }),
      ]),
    ).toEqual([]);
  });
});
