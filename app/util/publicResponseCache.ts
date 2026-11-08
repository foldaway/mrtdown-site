export const PUBLIC_BROWSER_CACHE_CONTROL =
  'public, max-age=0, must-revalidate';
export const PUBLIC_CLOUDFLARE_CACHE_CONTROL =
  'public, max-age=900, stale-while-revalidate=300, stale-if-error=86400';
export const STATION_PROFILE_FRESH_UNTIL_HEADER =
  'X-MRTDown-Station-Fresh-Until';

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
  edgeCacheControl = PUBLIC_CLOUDFLARE_CACHE_CONTROL,
) {
  headers.set('Cache-Control', PUBLIC_BROWSER_CACHE_CONTROL);
  headers.set('Cloudflare-CDN-Cache-Control', edgeCacheControl);
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
  const freshUntil = response.headers.get(STATION_PROFILE_FRESH_UNTIL_HEADER);
  const cacheable =
    (request.method === 'GET' || request.method === 'HEAD') &&
    response.status === 200 &&
    kind != null &&
    !hasSharedCacheOptOut(response);
  if (!cacheable && freshUntil == null) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete(STATION_PROFILE_FRESH_UNTIL_HEADER);
  if (cacheable) {
    const pathname = new URL(request.url).pathname;
    const isStationProfile =
      (kind === 'html' && isStationProfilePath(pathname)) ||
      (kind === 'server-function' && freshUntil != null);
    if (isStationProfile) {
      // Subtract the time spent assembling and rendering the response.
      const expiresAt = Number(freshUntil ?? Number.NaN);
      const ttl = Math.floor((expiresAt - Date.now()) / 1000);
      if (Number.isFinite(ttl) && ttl > 0) {
        setPublicDataCacheHeaders(
          headers,
          kind,
          `public, max-age=${ttl}, must-revalidate, stale-if-error=0`,
        );
      } else {
        headers.set('Cache-Control', 'no-store');
        headers.delete('Cloudflare-CDN-Cache-Control');
        headers.delete('Cache-Tag');
        headers.set('X-MRTDown-Cache', 'dynamic-station');
      }
    } else {
      setPublicDataCacheHeaders(
        headers,
        kind,
        kind === 'html' ? getReportCacheControl(pathname) : undefined,
      );
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isStationProfilePath(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const stationsIndex = segments.at(-2);
  return stationsIndex === 'stations' && segments.length <= 3;
}

function getReportCacheControl(pathname: string) {
  const path = pathname
    .replace(/^\/(?:en-SG|zh-Hans|ms|ta)(?=\/)/, '')
    .replace(/\/$/, '');
  if (/^\/reports\/weekly\/\d{4}-\d{2}-\d{2}$/.test(path)) {
    return 'public, max-age=2592000, stale-while-revalidate=86400, stale-if-error=604800';
  }
  if (path === '/reports/weekly') {
    return 'public, max-age=3600, stale-while-revalidate=300, stale-if-error=86400';
  }
}
