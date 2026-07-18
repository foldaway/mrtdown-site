import { describe, expect, it } from 'vitest';
import {
  applyPublicDataCacheHeaders,
  getPublicDataCacheTag,
  PUBLIC_BROWSER_CACHE_CONTROL,
  PUBLIC_CLOUDFLARE_CACHE_CONTROL,
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
    expect(
      applyPublicDataCacheHeaders(
        request(),
        response('text/html', { headers: { 'set-cookie': 'sid=1' } }),
      ).headers.get('x-mrtdown-cache'),
    ).toBeNull();
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
