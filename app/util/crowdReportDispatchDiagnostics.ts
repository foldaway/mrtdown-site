import * as Sentry from '@sentry/tanstackstart-react';
import type { z } from 'zod';

const DISPATCH_PATH = '/internal/api/tasks/crowd-report-dispatch';

type DispatchRequestFailure = {
  status: 400 | 401 | 503 | 207;
  reason:
    | 'missing_authorization'
    | 'invalid_bearer'
    | 'token_mismatch'
    | 'invalid_json'
    | 'invalid_request'
    | 'missing_root_url'
    | 'missing_github_token'
    | 'dispatch_failed';
  issues?: z.core.$ZodIssue[];
  candidateCount?: number;
  failedCount?: number;
};

function getHeaderFormat(authorization: string | null) {
  if (authorization == null) return 'missing';
  if (/^(?:Bearer\s+)?REDACTED:/i.test(authorization.trim())) {
    return 'redacted_placeholder';
  }
  return /^Bearer\s+\S/i.test(authorization) ? 'bearer' : 'invalid_scheme';
}

/** Capture handled failures without sending credentials, bodies, or parser errors. */
export function captureCrowdReportDispatchRequestFailure(
  request: Request,
  failure: DispatchRequestFailure,
) {
  const url = new URL(request.url);
  if (url.pathname !== DISPATCH_PATH) return;

  const context = {
    status: failure.status,
    reason: failure.reason,
    // Avoid "authorization" in this safe enum's key: Sentry scrubs that name.
    headerFormat: getHeaderFormat(request.headers.get('authorization')),
    internalTokensConfigured: Boolean(process.env.INTERNAL_API_TOKENS?.trim()),
    hasQstashSignature: request.headers.has('upstash-signature'),
    qstashMessageId: request.headers.get('upstash-message-id')?.slice(0, 200),
    qstashScheduleId: request.headers.get('upstash-schedule-id')?.slice(0, 200),
    cloudflareRayId: request.headers.get('cf-ray')?.slice(0, 200),
    candidateCount: failure.candidateCount,
    failedCount: failure.failedCount,
    // Zod messages and unknown field names can contain submitted values.
    validationIssueCount: failure.issues?.length,
    // Keep these flat so Sentry's context depth limit preserves the details.
    validationIssues: failure.issues?.slice(0, 20).map((issue) => {
      const path = issue.path
        .map((part) =>
          ['dryRun', 'kind', 'limit'].includes(String(part))
            ? part
            : '<unknown>',
        )
        .join('.');
      return `${issue.code}:${path || '<root>'}`;
    }),
  };

  try {
    Sentry.withScope((scope) => {
      scope.addEventProcessor((event) => ({
        ...event,
        // Replace ambient SDK request data as well as our explicit context.
        request: {
          method: request.method,
          url: `${url.origin}${DISPATCH_PATH}`,
        },
        contexts: {
          trace: event.contexts?.trace && {
            trace_id: event.contexts.trace.trace_id,
            span_id: event.contexts.trace.span_id,
            parent_span_id: event.contexts.trace.parent_span_id,
            op: event.contexts.trace.op,
            status: event.contexts.trace.status,
          },
          crowd_report_dispatch: context,
        },
        extra: undefined,
        breadcrumbs: undefined,
        user: undefined,
      }));
      Sentry.captureEvent({
        message: 'Crowd report dispatch request failed',
        level:
          failure.status === 207 || failure.status === 503
            ? 'error'
            : 'warning',
        tags: {
          component: 'crowd-report-dispatch',
          'http.status_code': String(failure.status),
          reason: failure.reason,
        },
        fingerprint: [
          'crowd-report-dispatch',
          String(failure.status),
          failure.reason,
        ],
      });
    });
  } catch {
    // Observability must not change the endpoint's response or leak SDK errors.
    console.error('Failed to capture crowd report dispatch diagnostic');
  }
}
