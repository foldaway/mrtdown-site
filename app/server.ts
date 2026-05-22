import * as Sentry from '@sentry/cloudflare';
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
import handler from '@tanstack/react-start/server-entry';
import { handleScheduledWorkflows } from './workflows/scheduled';

const wrappedFetch = wrapFetchWithSentry({
  async fetch(request) {
    const startedAt = performance.now();
    const response = await handler.fetch(request);
    const elapsedMs = performance.now() - startedAt;

    const responseWithHeaders = addResponseInstrumentationHeaders(
      response,
      elapsedMs,
    );

    if (import.meta.env.DEV && responseWithHeaders.status !== 101) {
      logResponseByteEstimate(request, responseWithHeaders.clone(), elapsedMs);
    }

    return responseWithHeaders;
  },
});

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

export { PullWorkflow } from './workflows/pull';
export { PublicHolidaysWorkflow } from './workflows/publicHolidays';

export default Sentry.withSentry(
  (env) => {
    return {
      dsn: env.SENTRY_DSN ?? '',
      environment: env.TIER ?? 'development',
    };
  },
  {
    fetch: wrappedFetch.fetch,
    async scheduled(event, env, ctx) {
      await handleScheduledWorkflows(event, env, ctx);
    },
  } satisfies ExportedHandler<Env>,
);
