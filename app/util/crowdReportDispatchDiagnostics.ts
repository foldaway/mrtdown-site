import * as Sentry from '@sentry/tanstackstart-react';
import { z } from 'zod';

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

type SubmissionDispatchFailure =
  | { reason: 'missing_configuration'; missingConfiguration: string[] }
  | { reason: 'dispatch_failed'; candidateCount: number; failedCount: number }
  | { reason: 'dispatch_exception'; error: unknown };

type DispatchDiagnostic = {
  message: string;
  reason: string;
  trigger: 'request' | 'submission';
  status?: number;
  context: Record<string, unknown>;
  request?: Request;
  error?: unknown;
};

function validationDetails(issues: z.core.$ZodIssue[] | undefined) {
  const fields = [
    'dryRun',
    'kind',
    'limit',
    'content',
    'source',
    'reportId',
    'text',
    'createdAt',
    'observedAt',
    'lineIds',
    'stationIds',
    'directionText',
    'effect',
    'delayMinutes',
    'reportCount',
    'url',
  ];
  return {
    validationIssueCount: issues?.length,
    // Keep these flat so Sentry's context depth limit preserves the details.
    // Messages and unknown field names can contain submitted values.
    validationIssues: issues?.slice(0, 20).map((issue) => {
      const path = issue.path
        .map((part) =>
          typeof part === 'number' || fields.includes(String(part))
            ? part
            : '<unknown>',
        )
        .join('.');
      return `${issue.code}:${path || '<root>'}`;
    }),
  };
}

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
    ...validationDetails(failure.issues),
  };

  captureDispatchDiagnostic({
    message: 'Crowd report dispatch request failed',
    trigger: 'request',
    reason: failure.reason,
    status: failure.status,
    request,
    context,
  });
}

/** Submission dispatch runs after the request commits and catches its own errors. */
export function captureCrowdReportDispatchAfterSubmissionFailure(
  failure: SubmissionDispatchFailure,
) {
  const isException = failure.reason === 'dispatch_exception';
  const validationError =
    isException && failure.error instanceof z.ZodError
      ? failure.error
      : undefined;
  captureDispatchDiagnostic({
    message: 'Crowd report dispatch after submission failed',
    trigger: 'submission',
    reason: failure.reason,
    ...(isException ? { error: failure.error } : {}),
    context: {
      reason: failure.reason,
      ...(failure.reason === 'missing_configuration'
        ? { missingConfiguration: failure.missingConfiguration }
        : failure.reason === 'dispatch_failed'
          ? {
              candidateCount: failure.candidateCount,
              failedCount: failure.failedCount,
            }
          : {
              errorType: validationError
                ? 'ZodError'
                : failure.error instanceof Error
                  ? 'Error'
                  : 'non_error',
            }),
      ...validationDetails(validationError?.issues),
    },
  });
}

function captureDispatchDiagnostic(diagnostic: DispatchDiagnostic) {
  const url = diagnostic.request ? new URL(diagnostic.request.url) : undefined;
  const metadata = {
    level:
      diagnostic.trigger === 'request' &&
      diagnostic.status != null &&
      diagnostic.status < 500 &&
      diagnostic.status !== 207
        ? ('warning' as const)
        : ('error' as const),
    tags: {
      component: 'crowd-report-dispatch',
      trigger: diagnostic.trigger,
      reason: diagnostic.reason,
      ...(diagnostic.status == null
        ? {}
        : { 'http.status_code': String(diagnostic.status) }),
    },
    fingerprint: [
      'crowd-report-dispatch',
      diagnostic.status == null
        ? diagnostic.trigger
        : String(diagnostic.status),
      diagnostic.reason,
    ],
  };
  try {
    Sentry.withScope((scope) => {
      scope.addEventProcessor((event) => ({
        ...event,
        message: diagnostic.message,
        // Replace ambient SDK request data as well as our explicit context.
        request: url && {
          method: diagnostic.request?.method,
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
          crowd_report_dispatch: diagnostic.context,
        },
        extra: undefined,
        breadcrumbs: undefined,
        user: undefined,
        // Preserve exception stacks, but not error messages or cause data that
        // can contain GitHub response text, SQL parameters, or report content.
        exception: event.exception && {
          values: event.exception.values?.map((exception) => ({
            type:
              diagnostic.context.errorType === 'ZodError'
                ? 'ZodError'
                : 'Error',
            value: diagnostic.message,
            stacktrace: exception.stacktrace && {
              ...exception.stacktrace,
              frames: exception.stacktrace.frames?.map((frame) => ({
                ...frame,
                vars: undefined,
              })),
            },
            mechanism: { type: 'generic', handled: true },
          })),
        },
      }));
      if ('error' in diagnostic) {
        Sentry.captureException(diagnostic.error, metadata);
      } else {
        Sentry.captureEvent({ message: diagnostic.message, ...metadata });
      }
    });
  } catch {
    // Observability must not change the endpoint's response or leak SDK errors.
    console.error('Failed to capture crowd report dispatch diagnostic');
  }
}
