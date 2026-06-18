const PUBLIC_HTML_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const PUBLIC_HTML_CACHE_NAME = 'mrtdown-public-html';

const HTML_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];

const CACHEABLE_ROUTE_PREFIXES = [
  '/community-reports/',
  '/history/',
  '/lines/',
  '/operators/',
  '/stations/',
];

const CACHEABLE_ROUTES = new Set([
  '/',
  '/about',
  '/history',
  '/statistics',
  '/system-map',
]);

const LOCALE_SEGMENTS = new Set(['en-SG', 'zh-Hans', 'ms', 'ta']);

const COMMUNITY_SIGNAL_ROUTE_PREFIXES = ['/lines/', '/stations/'];
const COMMUNITY_SIGNAL_ROUTES = new Set(['/']);

function hasCacheBypassDirective(request: Request) {
  const cacheControl = request.headers.get('cache-control')?.toLowerCase();
  const pragma = request.headers.get('pragma')?.toLowerCase();
  return (
    cacheControl?.includes('no-cache') === true ||
    cacheControl?.includes('no-store') === true ||
    cacheControl?.includes('max-age=0') === true ||
    pragma?.includes('no-cache') === true
  );
}

function stripLocaleSegment(pathname: string) {
  const [firstSegment = '', ...rest] = pathname.split('/').filter(Boolean);
  if (!LOCALE_SEGMENTS.has(firstSegment)) {
    return pathname;
  }

  return rest.length > 0 ? `/${rest.join('/')}` : '/';
}

export function isCacheablePublicHtmlPath(pathname: string) {
  const publicPath = stripLocaleSegment(pathname);
  return (
    CACHEABLE_ROUTES.has(publicPath) ||
    CACHEABLE_ROUTE_PREFIXES.some((prefix) => publicPath.startsWith(prefix))
  );
}

export function isCommunitySignalPublicPath(pathname: string) {
  const publicPath = stripLocaleSegment(pathname);
  return (
    COMMUNITY_SIGNAL_ROUTES.has(publicPath) ||
    COMMUNITY_SIGNAL_ROUTE_PREFIXES.some((prefix) =>
      publicPath.startsWith(prefix),
    )
  );
}

export function isPublicHtmlCacheLookupRequest(request: Request) {
  return (
    request.method === 'GET' &&
    !hasCacheBypassDirective(request) &&
    isCacheablePublicHtmlPath(new URL(request.url).pathname)
  );
}

export function getPublicHtmlCacheKey(request: Request) {
  return new Request(request.url, { method: 'GET' });
}

function isHtmlResponse(response: Response) {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  return HTML_CONTENT_TYPES.some((htmlType) => contentType.includes(htmlType));
}

function hasSharedCacheOptOut(response: Response) {
  const cacheControl = response.headers.get('cache-control')?.toLowerCase();
  return (
    cacheControl != null &&
    (cacheControl.includes('private') || cacheControl.includes('no-store'))
  );
}

export function shouldCachePublicHtml(request: Request, response: Response) {
  if (
    (request.method !== 'GET' && request.method !== 'HEAD') ||
    hasCacheBypassDirective(request)
  ) {
    return false;
  }
  if (response.status !== 200) {
    return false;
  }
  if (!isHtmlResponse(response)) {
    return false;
  }
  if (response.headers.has('set-cookie') || hasSharedCacheOptOut(response)) {
    return false;
  }

  return isCacheablePublicHtmlPath(new URL(request.url).pathname);
}

export function applyPublicHtmlCacheHeaders(
  request: Request,
  response: Response,
) {
  if (!shouldCachePublicHtml(request, response)) {
    return response;
  }

  try {
    setPublicHtmlCacheHeaders(response.headers);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    setPublicHtmlCacheHeaders(headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

function setPublicHtmlCacheHeaders(headers: Headers) {
  headers.set('Cache-Control', PUBLIC_HTML_CACHE_CONTROL);
  headers.set('X-MRTDown-Cache', 'public-html');
}

export function createPublicHtmlCacheResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.delete('Server-Timing');
  headers.delete('X-MRTDown-Render');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function getCachedPublicHtmlResponse(request: Request) {
  if (!isPublicHtmlCacheLookupRequest(request)) {
    return null;
  }

  try {
    const cache = await caches.open(PUBLIC_HTML_CACHE_NAME);
    const response = await cache.match(getPublicHtmlCacheKey(request));
    if (response == null) {
      return null;
    }

    const headers = new Headers(response.headers);
    headers.set('X-MRTDown-Cache', 'hit');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.warn('Failed to read public HTML cache', error);
    return null;
  }
}

export async function storePublicHtmlResponse(
  request: Request,
  response: Response,
) {
  try {
    const cache = await caches.open(PUBLIC_HTML_CACHE_NAME);
    await cache.put(
      getPublicHtmlCacheKey(request),
      createPublicHtmlCacheResponse(response),
    );
  } catch (error) {
    console.warn('Failed to store public HTML cache', error);
  }
}
