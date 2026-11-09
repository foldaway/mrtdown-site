import * as Sentry from '@sentry/tanstackstart-react';
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import type { Root } from 'xast';
import { toXml } from 'xast-util-to-xml';
import { getUnsupportedAgentMarkdownResponse } from './util/agentMarkdown';
import { applyPublicDataCacheHeaders } from './util/publicResponseCache';
import {
  addSentryAnonymousUserCookie,
  getSentryAnonymousUser,
} from './util/sentryAnonymousUser';

async function appFetch(request: Request) {
  const startedAt = performance.now();
  const sentryAnonymousUser = getSentryAnonymousUser(request);
  Sentry.setUser({
    id: sentryAnonymousUser.sentryUserId,
    ip_address: null,
  });
  const unsupportedMarkdownResponse =
    getUnsupportedAgentMarkdownResponse(request);
  if (unsupportedMarkdownResponse != null) {
    const elapsedMs = performance.now() - startedAt;
    return addResponseInstrumentationHeaders(
      unsupportedMarkdownResponse,
      elapsedMs,
    );
  }

  let response: Response;
  try {
    response = await handler.fetch(request);
  } catch (error) {
    if (isSitemapRequest(request)) {
      const elapsedMs = performance.now() - startedAt;
      return addResponseInstrumentationHeaders(
        createWorkerSitemapErrorResponse(request, error),
        elapsedMs,
      );
    }
    throw error;
  }
  const elapsedMs = performance.now() - startedAt;
  const responseWithHeaders = applyPublicDataCacheHeaders(
    request,
    addResponseInstrumentationHeaders(response, elapsedMs),
  );

  if (import.meta.env.DEV && responseWithHeaders.status !== 101) {
    logResponseByteEstimate(request, responseWithHeaders.clone(), elapsedMs);
  }

  // Set the telemetry cookie only on the dedicated no-store bootstrap request.
  // Adding it to SSR HTML would force Cloudflare to bypass the document cache.
  if (isSentryAnonymousUserBootstrapRequest(request)) {
    return addSentryAnonymousUserCookie(
      responseWithHeaders,
      sentryAnonymousUser,
    );
  }

  return responseWithHeaders;
}

function isSentryAnonymousUserBootstrapRequest(request: Request) {
  return (
    request.method === 'GET' &&
    new URL(request.url).pathname === '/api/sentry-anonymous-user'
  );
}

function isSitemapRequest(request: Request) {
  const url = new URL(request.url);
  return request.method === 'GET' && url.pathname === '/sitemap.xml';
}

function createWorkerSitemapErrorResponse(request: Request, error: unknown) {
  const rootUrl =
    import.meta.env.VITE_ROOT_URL ?? new URL('/', request.url).href;
  const root: Root = {
    type: 'root',
    children: [
      {
        type: 'element',
        name: 'urlset',
        attributes: {
          xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
        },
        children: [
          {
            type: 'element',
            name: 'url',
            attributes: {},
            children: [
              {
                type: 'element',
                name: 'loc',
                attributes: {},
                children: [
                  {
                    type: 'text',
                    value: new URL('/', rootUrl).toString(),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  return new Response(toXml(root), {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/xml',
      'x-sitemap-status': 'worker-fallback',
      'x-sitemap-error-stage': 'handler_fetch',
      'x-sitemap-error-name': sanitizeDiagnosticHeader(getErrorName(error)),
      'x-sitemap-error-message': sanitizeDiagnosticHeader(
        getErrorMessage(error),
      ),
    },
  });
}

function getErrorName(error: unknown) {
  if (error instanceof Error) {
    return error.name;
  }
  return typeof error;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function sanitizeDiagnosticHeader(value: string) {
  return value.replace(/[\r\n]/g, ' ').slice(0, 180);
}

function addResponseInstrumentationHeaders(
  response: Response,
  elapsedMs: number,
) {
  const workerTiming = `worker_request;dur=${elapsedMs.toFixed(1)}`;
  try {
    appendInstrumentationHeaders(response.headers, workerTiming);
    return response;
  } catch {
    if (response.status === 101) {
      return response;
    }

    const headers = new Headers(response.headers);
    appendInstrumentationHeaders(headers, workerTiming);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

function appendInstrumentationHeaders(headers: Headers, workerTiming: string) {
  const currentServerTiming = headers.get('Server-Timing');
  headers.set(
    'Server-Timing',
    currentServerTiming != null && currentServerTiming !== ''
      ? `${currentServerTiming}, ${workerTiming}`
      : workerTiming,
  );
  headers.set('X-MRTDown-Render', 'worker');
}

async function logResponseByteEstimate(
  request: Request,
  response: Response,
  elapsedMs: number,
) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    return;
  }

  try {
    const bytes = (await response.arrayBuffer()).byteLength;
    console.info(
      JSON.stringify({
        event: 'route_payload_estimate',
        method: request.method,
        pathname: new URL(request.url).pathname,
        responseBytes: bytes,
        status: response.status,
        elapsedMs: Number(elapsedMs.toFixed(1)),
      }),
    );
  } catch (error) {
    console.warn('Failed to estimate route response bytes', error);
  }
}

export default createServerEntry(
  wrapFetchWithSentry({
    fetch: appFetch,
  }),
);
