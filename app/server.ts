import * as Sentry from '@sentry/cloudflare';
import handler from '@tanstack/react-start/server-entry';
import {
  applyPublicHtmlCacheHeaders,
  getCachedPublicHtmlResponse,
  isCommunitySignalPublicPath,
  isPublicHtmlCacheLookupRequest,
  shouldCachePublicHtml,
  storePublicHtmlResponse,
} from './util/publicHtmlCache';
import {
  type CrowdReportFeatureEnv,
  isCrowdReportsFeatureEnabled,
} from './util/crowdReportFeatureFlag';
import {
  addSentryAnonymousUserCookie,
  getSentryAnonymousUser,
  stripSentryUserIpAddress,
} from './util/sentryAnonymousUser';
import { handleScheduledWorkflows } from './workflows/scheduled';

async function appFetch(request: Request, _env: Env, ctx: ExecutionContext) {
  const startedAt = performance.now();
  const sentryAnonymousUser = getSentryAnonymousUser(request);
  Sentry.setUser({
    id: sentryAnonymousUser.sentryUserId,
    ip_address: null,
  });
  const shouldUsePublicHtmlCache = !shouldBypassPublicHtmlCacheForCrowdReports(
    request,
    _env,
  );
  const cachedResponse = shouldUsePublicHtmlCache
    ? await getCachedPublicHtmlResponse(request)
    : null;
  if (cachedResponse != null) {
    const elapsedMs = performance.now() - startedAt;
    return addSentryAnonymousUserCookie(
      addResponseInstrumentationHeaders(
        cachedResponse,
        elapsedMs,
        'public-html-cache',
      ),
      sentryAnonymousUser,
    );
  }

  const response = await handler.fetch(request);
  const elapsedMs = performance.now() - startedAt;
  const shouldStorePublicHtml =
    shouldUsePublicHtmlCache && shouldCachePublicHtml(request, response);
  const responseWithCacheHeaders = shouldUsePublicHtmlCache
    ? applyPublicHtmlCacheHeaders(request, response)
    : response;

  if (shouldStorePublicHtml && isPublicHtmlCacheLookupRequest(request)) {
    ctx.waitUntil(
      storePublicHtmlResponse(request, responseWithCacheHeaders.clone()),
    );
  }

  const responseWithHeaders = addResponseInstrumentationHeaders(
    responseWithCacheHeaders,
    elapsedMs,
    'worker',
  );

  if (import.meta.env.DEV && responseWithHeaders.status !== 101) {
    logResponseByteEstimate(request, responseWithHeaders.clone(), elapsedMs);
  }

  return addSentryAnonymousUserCookie(responseWithHeaders, sentryAnonymousUser);
}

function shouldBypassPublicHtmlCacheForCrowdReports(
  request: Request,
  env: CrowdReportFeatureEnv,
) {
  return (
    isCrowdReportsFeatureEnabled(env, { isLocalDev: import.meta.env.DEV }) &&
    isCommunitySignalPublicPath(new URL(request.url).pathname)
  );
}

function addResponseInstrumentationHeaders(
  response: Response,
  elapsedMs: number,
  render: 'public-html-cache' | 'worker',
) {
  const workerTiming = `worker_request;dur=${elapsedMs.toFixed(1)}`;
  try {
    appendInstrumentationHeaders(response.headers, workerTiming, render);
    return response;
  } catch {
    if (response.status === 101) {
      return response;
    }

    const headers = new Headers(response.headers);
    appendInstrumentationHeaders(headers, workerTiming, render);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

function appendInstrumentationHeaders(
  headers: Headers,
  workerTiming: string,
  render: 'public-html-cache' | 'worker',
) {
  const currentServerTiming = headers.get('Server-Timing');
  headers.set(
    'Server-Timing',
    currentServerTiming != null && currentServerTiming !== ''
      ? `${currentServerTiming}, ${workerTiming}`
      : workerTiming,
  );
  headers.set('X-MRTDown-Render', render);
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

export { PullWorkflow } from './workflows/pull';
export { PublicHolidaysWorkflow } from './workflows/publicHolidays';

export default Sentry.withSentry(
  (env) => {
    return {
      dsn: env.SENTRY_DSN ?? '',
      environment: env.TIER ?? 'development',
      beforeSend: stripSentryUserIpAddress,
    };
  },
  {
    fetch: appFetch,
    async scheduled(event, env, ctx) {
      await handleScheduledWorkflows(event, env, ctx);
    },
  } satisfies ExportedHandler<Env>,
);
