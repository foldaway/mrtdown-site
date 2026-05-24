import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
import { getDb } from '~/db';
import {
  buildCrowdReportAbuseContext,
  CrowdReportRateLimitError,
  findMissingCrowdReportReferences,
  getClientIp,
  persistCrowdReport,
  validateCrowdReportSubmission,
  verifyTurnstileToken,
} from '~/util/crowdReports';

const MAX_REQUEST_BYTES = 10_000;

type CrowdReportRuntimeEnv = typeof env & {
  CROWD_REPORT_HASH_SALT?: string;
  CROWD_REPORT_RATE_LIMIT_PER_HOUR?: string;
  CROWD_REPORT_TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};

function getRuntimeEnv() {
  return env as CrowdReportRuntimeEnv;
}

function getRateLimitPerHour(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

async function parseJsonBody(request: Request) {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
    return {
      success: false as const,
      response: Response.json(
        { success: false, error: 'Request body is too large' },
        { status: 413 },
      ),
    };
  }

  try {
    return { success: true as const, body: await request.json() };
  } catch {
    return {
      success: false as const,
      response: Response.json(
        { success: false, error: 'Request body must be valid JSON' },
        { status: 400 },
      ),
    };
  }
}

export const Route = createFileRoute('/api/reports')({
  server: {
    handlers: {
      async POST({ request }) {
        const runtimeEnv = getRuntimeEnv();
        const hashSalt =
          runtimeEnv.CROWD_REPORT_HASH_SALT ??
          (import.meta.env.DEV ? 'development-crowd-report-salt' : undefined);
        if (!hashSalt) {
          return Response.json(
            { success: false, error: 'Crowd reports are not configured' },
            { status: 503 },
          );
        }

        const parsedBody = await parseJsonBody(request);
        if (!parsedBody.success) {
          return parsedBody.response;
        }

        const validation = validateCrowdReportSubmission(parsedBody.body);
        if (!validation.success) {
          return Response.json(
            {
              success: false,
              error: 'Invalid report',
              issues: validation.issues,
            },
            { status: 400 },
          );
        }

        const turnstile = await verifyTurnstileToken(
          runtimeEnv.CROWD_REPORT_TURNSTILE_SECRET_KEY ??
            runtimeEnv.TURNSTILE_SECRET_KEY,
          validation.data.turnstileToken,
          getClientIp(request),
        );
        if (!turnstile.success) {
          return Response.json(
            {
              success: false,
              error: turnstile.error,
            },
            { status: 403 },
          );
        }

        const abuseContext = await buildCrowdReportAbuseContext(
          request,
          validation.data,
          hashSalt,
          turnstile.outcome,
        );

        const db = getDb();
        const missingReferences = await findMissingCrowdReportReferences(
          db,
          validation.data,
        );
        if (
          missingReferences.lineIds.length > 0 ||
          missingReferences.stationIds.length > 0
        ) {
          return Response.json(
            {
              success: false,
              error: 'Invalid affected line or station',
              missingReferences,
            },
            { status: 400 },
          );
        }

        try {
          const report = await persistCrowdReport(
            db,
            validation.data,
            abuseContext,
            {
              rateLimitPerHour: getRateLimitPerHour(
                runtimeEnv.CROWD_REPORT_RATE_LIMIT_PER_HOUR,
              ),
            },
          );

          return Response.json(
            {
              success: true,
              data: report,
            },
            { status: 202 },
          );
        } catch (error) {
          if (error instanceof CrowdReportRateLimitError) {
            return Response.json(
              {
                success: false,
                error: 'Too many reports submitted from this network',
              },
              {
                status: 429,
                headers: {
                  'retry-after': String(60 * 60),
                },
              },
            );
          }

          console.error('Crowd report submission failed', { error });
          return Response.json(
            { success: false, error: 'Report submission failed' },
            { status: 500 },
          );
        }
      },
    },
  },
});
