import type { Route } from './+types/api.ph.$';

const API_HOST = 'us.i.posthog.com';
const ASSET_HOST = 'us-assets.i.posthog.com';

const posthogProxy = async (request: Request) => {
  const url = new URL(request.url);
  const hostname = url.pathname.startsWith('/api/ph/static/')
    ? ASSET_HOST
    : API_HOST;

  const newUrl = new URL(url);
  newUrl.protocol = 'https';
  newUrl.hostname = hostname;
  newUrl.port = '443';
  newUrl.pathname = newUrl.pathname.replace(/^\/api\/ph/, '');

  const headers = new Headers(request.headers);
  headers.set('host', hostname);
  headers.delete('accept-encoding');

  const response = await fetch(newUrl, {
    method: request.method,
    headers,
    body: request.body,
    // @ts-ignore - duplex is required for streaming request bodies
    duplex: 'half',
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};

export async function loader({ request }: Route.LoaderArgs) {
  return posthogProxy(request);
}

export async function action({ request }: Route.ActionArgs) {
  return posthogProxy(request);
}
