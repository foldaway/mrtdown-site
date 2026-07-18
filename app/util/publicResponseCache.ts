export const PUBLIC_BROWSER_CACHE_CONTROL =
  'public, max-age=0, must-revalidate';
export const PUBLIC_CLOUDFLARE_CACHE_CONTROL =
  'public, max-age=900, stale-while-revalidate=300, stale-if-error=86400';

export type PublicCacheKind =
  | 'html'
  | 'markdown'
  | 'sitemap'
  | 'server-function'
  | 'issues-day';

export function getPublicDataCacheTag(tier = process.env.TIER) {
  const normalizedTier = (tier ?? 'development')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
  return `mrtdown-${normalizedTier}-data`;
}

export function setPublicDataCacheHeaders(
  headers: Headers,
  kind: PublicCacheKind,
) {
  headers.set('Cache-Control', PUBLIC_BROWSER_CACHE_CONTROL);
  headers.set('Cloudflare-CDN-Cache-Control', PUBLIC_CLOUDFLARE_CACHE_CONTROL);
  headers.set('Cache-Tag', getPublicDataCacheTag());
  headers.set('X-MRTDown-Cache', `public-${kind}`);

  // Origin timings describe only the cache-fill request and become misleading
  // when Cloudflare replays them on cache hits.
  headers.delete('Server-Timing');
  headers.delete('X-MRTDown-Render');
}

function getResponseKind(
  request: Request,
  response: Response,
): PublicCacheKind | null {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('text/html')) {
    return 'html';
  }
  if (contentType.includes('text/markdown')) {
    return 'markdown';
  }
  if (
    (contentType.includes('application/xml') ||
      contentType.includes('text/xml')) &&
    response.headers.get('x-sitemap-status') === 'ok'
  ) {
    return 'sitemap';
  }
  if (
    contentType.includes('application/json') &&
    request.headers.get('x-tsr-serverfn') === 'true'
  ) {
    return 'server-function';
  }
  if (
    contentType.includes('application/json') &&
    new URL(request.url).pathname === '/api/issues-day'
  ) {
    return 'issues-day';
  }
  return null;
}

function hasSharedCacheOptOut(response: Response) {
  const cacheControl = response.headers.get('cache-control')?.toLowerCase();
  return (
    response.headers.has('set-cookie') ||
    cacheControl?.includes('private') === true ||
    cacheControl?.includes('no-store') === true
  );
}

export function applyPublicDataCacheHeaders(
  request: Request,
  response: Response,
) {
  const kind = getResponseKind(request, response);
  if (
    (request.method !== 'GET' && request.method !== 'HEAD') ||
    response.status !== 200 ||
    kind == null ||
    hasSharedCacheOptOut(response)
  ) {
    return response;
  }

  try {
    setPublicDataCacheHeaders(response.headers, kind);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    setPublicDataCacheHeaders(headers, kind);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
