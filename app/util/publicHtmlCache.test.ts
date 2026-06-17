import { describe, expect, it } from 'vitest';
import {
  applyPublicHtmlCacheHeaders,
  createPublicHtmlCacheResponse,
  getPublicHtmlCacheKey,
  isCommunitySignalPublicPath,
  isPublicHtmlCacheLookupRequest,
  shouldCachePublicHtml,
} from './publicHtmlCache';

function htmlResponse(init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'text/html; charset=utf-8');
  }
  return new Response('<!doctype html>', {
    ...init,
    headers,
  });
}

function request(pathname: string, init?: RequestInit) {
  return new Request(`https://www.mrtdown.org${pathname}`, init);
}

describe('public HTML cache headers', () => {
  it.each([
    '/',
    '/statistics',
    '/zh-Hans/statistics',
    '/history',
    '/history/2025',
    '/community-reports/cluster/cluster-1',
    '/zh-Hans/community-reports/report/report-1',
    '/lines/EWL',
    '/operators/SMRT',
    '/stations/NS1',
    '/system-map',
    '/about',
  ])('marks %s as cacheable public HTML', (pathname) => {
    expect(shouldCachePublicHtml(request(pathname), htmlResponse())).toBe(true);
  });

  it.each([
    '/api/reports',
    '/internal/api/tasks/pull',
    '/report',
    '/issues/2024-001',
    '/sitemap.xml',
  ])('does not mark %s as cacheable public HTML', (pathname) => {
    expect(shouldCachePublicHtml(request(pathname), htmlResponse())).toBe(
      false,
    );
  });

  it('requires a successful GET or HEAD HTML response without shared cache opt-outs', () => {
    expect(
      shouldCachePublicHtml(
        request('/statistics', { method: 'HEAD' }),
        htmlResponse(),
      ),
    ).toBe(true);

    expect(
      shouldCachePublicHtml(
        request('/statistics', { method: 'POST' }),
        htmlResponse(),
      ),
    ).toBe(false);
    expect(
      shouldCachePublicHtml(
        request('/statistics'),
        htmlResponse({ status: 404 }),
      ),
    ).toBe(false);
    expect(
      shouldCachePublicHtml(
        request('/statistics'),
        new Response('{}', {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ).toBe(false);
    expect(
      shouldCachePublicHtml(
        request('/statistics'),
        htmlResponse({ headers: { 'set-cookie': 'sid=1' } }),
      ),
    ).toBe(false);
    expect(
      shouldCachePublicHtml(
        request('/statistics'),
        htmlResponse({ headers: { 'cache-control': 'private, max-age=0' } }),
      ),
    ).toBe(false);
    expect(
      shouldCachePublicHtml(
        request('/statistics', {
          headers: { 'cache-control': 'no-cache' },
        }),
        htmlResponse(),
      ),
    ).toBe(false);
  });

  it('sets short shared cache headers for cacheable public HTML', () => {
    const response = applyPublicHtmlCacheHeaders(
      request('/statistics?utm_source=test'),
      htmlResponse(),
    );

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    );
    expect(response.headers.get('x-mrtdown-cache')).toBe('public-html');
  });

  it('uses GET cache lookups for cacheable public pages unless the request opts out', () => {
    expect(isPublicHtmlCacheLookupRequest(request('/statistics'))).toBe(true);
    expect(
      isPublicHtmlCacheLookupRequest(
        request('/statistics', { method: 'HEAD' }),
      ),
    ).toBe(false);
    expect(isPublicHtmlCacheLookupRequest(request('/api/reports'))).toBe(false);
    expect(
      isPublicHtmlCacheLookupRequest(
        request('/statistics', {
          headers: { 'cache-control': 'no-cache' },
        }),
      ),
    ).toBe(false);
    expect(
      isPublicHtmlCacheLookupRequest(
        request('/statistics', {
          headers: { 'cache-control': 'max-age=0' },
        }),
      ),
    ).toBe(false);
    expect(
      isPublicHtmlCacheLookupRequest(
        request('/statistics', {
          headers: { pragma: 'no-cache' },
        }),
      ),
    ).toBe(false);
  });

  it('preserves the full URL in the cache key', () => {
    const cacheKey = getPublicHtmlCacheKey(
      request('/zh-Hans/statistics?viewport=lg'),
    );

    expect(cacheKey.method).toBe('GET');
    expect(cacheKey.url).toBe(
      'https://www.mrtdown.org/zh-Hans/statistics?viewport=lg',
    );
  });

  it.each(['/', '/en-SG/', '/lines/BPLRT', '/zh-Hans/stations/BP6'])(
    'treats %s as community-signal sensitive public HTML',
    (pathname) => {
      expect(isCommunitySignalPublicPath(pathname)).toBe(true);
    },
  );

  it.each(['/statistics', '/history', '/about', '/operators/SMRT'])(
    'does not treat %s as community-signal sensitive public HTML',
    (pathname) => {
      expect(isCommunitySignalPublicPath(pathname)).toBe(false);
    },
  );

  it('removes request-specific instrumentation before storing cached HTML', () => {
    const cachedResponse = createPublicHtmlCacheResponse(
      htmlResponse({
        headers: {
          'content-type': 'text/html',
          'server-timing': 'worker_request;dur=100',
          'x-mrtdown-render': 'worker',
        },
      }),
    );

    expect(cachedResponse.headers.get('content-type')).toBe('text/html');
    expect(cachedResponse.headers.get('server-timing')).toBeNull();
    expect(cachedResponse.headers.get('x-mrtdown-render')).toBeNull();
  });
});
