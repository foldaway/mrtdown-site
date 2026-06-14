import { createFileRoute } from '@tanstack/react-router';

const API_HOST = 'us.i.posthog.com';
const ASSET_HOST = 'us-assets.i.posthog.com';
const POSTHOG_REQUEST_HEADER_ALLOWLIST = [
  'accept',
  'accept-language',
  'content-encoding',
  'content-type',
  'user-agent',
];

function getPosthogRequestHeaders(request: Request) {
  const headers = new Headers();

  for (const name of POSTHOG_REQUEST_HEADER_ALLOWLIST) {
    const value = request.headers.get(name);
    if (value != null) {
      headers.set(name, value);
    }
  }

  return headers;
}

function getPosthogHostname(pathname: string) {
  if (
    pathname.startsWith('/api/ph/static/') ||
    pathname.startsWith('/api/ph/array/')
  ) {
    return ASSET_HOST;
  }

  return API_HOST;
}

function getForwardedFor(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  );
}

const posthogProxy = async (request: Request) => {
  const url = new URL(request.url);
  const hostname = getPosthogHostname(url.pathname);

  const newUrl = new URL(url);
  newUrl.protocol = 'https';
  newUrl.hostname = hostname;
  newUrl.port = '443';
  newUrl.pathname = newUrl.pathname.replace(/^\/api\/ph/, '');

  const headers = getPosthogRequestHeaders(request);
  headers.set('host', hostname);

  const forwardedFor = getForwardedFor(request);
  if (forwardedFor != null && forwardedFor !== '') {
    headers.set('x-forwarded-for', forwardedFor);
  }

  const requestInit: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    signal: request.signal,
  };

  if (request.body != null && request.method !== 'GET') {
    requestInit.body = request.body;
    requestInit.duplex = 'half';
  }

  const response = await fetch(newUrl, requestInit);

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};

export const Route = createFileRoute('/api/ph/$')({
  server: {
    handlers: {
      async GET(ctx) {
        return posthogProxy(ctx.request);
      },
      async POST(ctx) {
        return posthogProxy(ctx.request);
      },
    },
  },
});
