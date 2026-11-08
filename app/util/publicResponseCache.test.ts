import {
  requestHandler,
  setResponseHeader,
} from '@tanstack/react-start/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPublicDataCacheHeaders,
  getPublicDataCacheTag,
  PUBLIC_BROWSER_CACHE_CONTROL,
  PUBLIC_CLOUDFLARE_CACHE_CONTROL,
  STATION_PROFILE_FRESH_UNTIL_HEADER,
} from './publicResponseCache';

function request(init?: RequestInit) {
  return new Request('https://www.mrtdown.org/example', init);
}

function response(contentType: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('content-type', contentType);
  return new Response('body', { ...init, headers });
}

describe('public response cache policy', () => {
  it.each([
    ['text/html; charset=utf-8', 'public-html'],
    ['text/markdown; charset=utf-8', 'public-markdown'],
  ])('marks successful %s responses as public', (contentType, marker) => {
    const cached = applyPublicDataCacheHeaders(
      request(),
      response(contentType),
    );

    expect(cached.headers.get('x-mrtdown-cache')).toBe(marker);
    expect(cached.headers.get('cache-control')).toBe(
      PUBLIC_BROWSER_CACHE_CONTROL,
    );
    expect(cached.headers.get('cloudflare-cdn-cache-control')).toBe(
      PUBLIC_CLOUDFLARE_CACHE_CONTROL,
    );
    expect(cached.headers.get('cache-tag')).toBe(getPublicDataCacheTag());
  });

  it('marks only a successfully generated XML sitemap as public', () => {
    const sitemap = applyPublicDataCacheHeaders(
      request(),
      response('application/xml', {
        headers: { 'x-sitemap-status': 'ok' },
      }),
    );
    const fallback = applyPublicDataCacheHeaders(
      request(),
      response('application/xml', {
        headers: { 'x-sitemap-status': 'fallback' },
      }),
    );

    expect(sitemap.headers.get('x-mrtdown-cache')).toBe('public-sitemap');
    expect(fallback.headers.get('x-mrtdown-cache')).toBeNull();
  });

  it.each([
    'https://www.mrtdown.org/stations/NS1',
    'https://www.mrtdown.org/stations/NS1/',
    'https://www.mrtdown.org/en-SG/stations/NS1',
  ])(
    'keeps station HTML without a freshness deadline uncached at %s',
    (url) => {
      const stationResponse = applyPublicDataCacheHeaders(
        new Request(url),
        response('text/html; charset=utf-8'),
      );

      expect(stationResponse.headers.get('cache-control')).toBe('no-store');
      expect(
        stationResponse.headers.get('cloudflare-cdn-cache-control'),
      ).toBeNull();
      expect(stationResponse.headers.get('cache-tag')).toBeNull();
      expect(stationResponse.headers.get('x-mrtdown-cache')).toBe(
        'dynamic-station',
      );
    },
  );

  it('marks successful public JSON read responses as cacheable', () => {
    const serverFunction = applyPublicDataCacheHeaders(
      request({ headers: { 'x-tsr-serverfn': 'true' } }),
      response('application/json'),
    );
    const issuesDay = applyPublicDataCacheHeaders(
      new Request('https://www.mrtdown.org/api/issues-day?year=2026'),
      response('application/json'),
    );
    const otherApi = applyPublicDataCacheHeaders(
      new Request('https://www.mrtdown.org/api/reports'),
      response('application/json'),
    );

    expect(serverFunction.headers.get('x-mrtdown-cache')).toBe(
      'public-server-function',
    );
    expect(issuesDay.headers.get('x-mrtdown-cache')).toBe('public-issues-day');
    expect(otherApi.headers.get('x-mrtdown-cache')).toBeNull();
  });

  it('respects method, status, cookies, and explicit cache opt-outs', () => {
    expect(
      applyPublicDataCacheHeaders(
        request({ method: 'POST' }),
        response('text/html'),
      ).headers.get('x-mrtdown-cache'),
    ).toBeNull();
    expect(
      applyPublicDataCacheHeaders(
        request(),
        response('text/html', { status: 404 }),
      ).headers.get('x-mrtdown-cache'),
    ).toBeNull();
    const stationWithCookie = applyPublicDataCacheHeaders(
      new Request('https://www.mrtdown.org/stations/ADM'),
      response('text/html', {
        headers: {
          'set-cookie': 'sid=1',
          [STATION_PROFILE_FRESH_UNTIL_HEADER]: String(Date.now() + 60_000),
        },
      }),
    );
    expect(stationWithCookie.headers.get('set-cookie')).toBe('sid=1');
    expect(stationWithCookie.headers.get('x-mrtdown-cache')).toBeNull();
    expect(
      stationWithCookie.headers.has(STATION_PROFILE_FRESH_UNTIL_HEADER),
    ).toBe(false);
    expect(
      applyPublicDataCacheHeaders(
        request(),
        response('text/html', { headers: { 'cache-control': 'no-store' } }),
      ).headers.get('x-mrtdown-cache'),
    ).toBeNull();
  });

  it('removes request-specific origin instrumentation', () => {
    const cached = applyPublicDataCacheHeaders(
      request(),
      response('text/html', {
        headers: {
          'server-timing': 'worker_request;dur=10',
          'x-mrtdown-render': 'worker',
        },
      }),
    );

    expect(cached.headers.get('server-timing')).toBeNull();
    expect(cached.headers.get('x-mrtdown-render')).toBeNull();
  });

  it('normalizes the deployment tier for cache tags', () => {
    expect(getPublicDataCacheTag('Preview Branch')).toBe(
      'mrtdown-preview-branch-data',
    );
  });
});

describe('station profile edge caching', () => {
  const now = Date.parse('2026-11-08T10:00:00Z');
  const station = new Request('https://www.mrtdown.org/zh-Hans/stations/ADM');
  const navigation = new Request('https://www.mrtdown.org/_serverFn/station', {
    headers: { 'x-tsr-serverfn': 'true' },
  });

  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(now));
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [station, 'text/html', 'public-html'],
    [navigation, 'application/json', 'public-server-function'],
  ])(
    'caches %s only until the supplied deadline',
    async (req, contentType, marker) => {
      const render = requestHandler(() => {
        setResponseHeader(
          STATION_PROFILE_FRESH_UNTIL_HEADER,
          String(now + 179_999),
        );
        return response(contentType);
      });
      const cached = applyPublicDataCacheHeaders(req, await render(req, {}));

      expect(cached.headers.get('cloudflare-cdn-cache-control')).toBe(
        'public, max-age=179, must-revalidate, stale-if-error=0',
      );
      expect(cached.headers.get('cache-control')).toBe(
        PUBLIC_BROWSER_CACHE_CONTROL,
      );
      expect(cached.headers.get('cache-tag')).toBe(getPublicDataCacheTag());
      expect(cached.headers.get('x-mrtdown-cache')).toBe(marker);
      expect(cached.headers.has(STATION_PROFILE_FRESH_UNTIL_HEADER)).toBe(
        false,
      );
    },
  );

  it('bypasses caching when the deadline passes before the response is sent', () => {
    const expired = applyPublicDataCacheHeaders(
      navigation,
      response('application/json', {
        headers: { [STATION_PROFILE_FRESH_UNTIL_HEADER]: String(now - 1) },
      }),
    );
    expect(expired.headers.get('cache-control')).toBe('no-store');
    expect(expired.headers.has('cloudflare-cdn-cache-control')).toBe(false);
    expect(expired.headers.has(STATION_PROFILE_FRESH_UNTIL_HEADER)).toBe(false);
  });
});

describe('report edge caching', () => {
  it.each([
    '/reports/weekly/2026-04-27',
    '/zh-Hans/reports/weekly/2026-04-27',
    '/ms/reports/weekly/2026-04-27/',
    '/ta/reports/weekly/2026-04-27',
  ])('caches completed report HTML for 30 days at %s', (path) => {
    const cached = applyPublicDataCacheHeaders(
      new Request(`https://www.mrtdown.org${path}`),
      response('text/html'),
    );
    expect(cached.headers.get('cloudflare-cdn-cache-control')).toContain(
      'max-age=2592000',
    );
    expect(cached.headers.get('cache-tag')).toBe(getPublicDataCacheTag());
    expect(cached.headers.get('cache-control')).toBe(
      PUBLIC_BROWSER_CACHE_CONTROL,
    );
  });
  it('uses one hour for archives but does not cache unavailable weeks', () => {
    const req = new Request('https://www.mrtdown.org/reports/weekly');
    expect(
      applyPublicDataCacheHeaders(req, response('text/html')).headers.get(
        'cloudflare-cdn-cache-control',
      ),
    ).toContain('max-age=3600');
    expect(
      applyPublicDataCacheHeaders(
        req,
        response('text/html', { status: 404 }),
      ).headers.has('cloudflare-cdn-cache-control'),
    ).toBe(false);
  });
});
