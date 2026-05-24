import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
import { getDb } from '~/db';
import {
  buildCrowdReportAbuseContext,
  CrowdReportRateLimitError,
  findMissingCrowdReportReferences,
  getClientIp,
  parseCrowdReportJsonBody,
  persistCrowdReport,
  validateCrowdReportSubmission,
  verifyTurnstileToken,
} from '~/util/crowdReports';
import {
  type CrowdReportFeatureEnv,
  isCrowdReportsFeatureEnabled,
} from '~/util/crowdReportFeatureFlag';

type CrowdReportRuntimeEnv = typeof env & {
  CROWD_REPORTS_ENABLED?: string;
  CROWD_REPORT_HASH_SALT?: string;
  CROWD_REPORT_RATE_LIMIT_PER_HOUR?: string;
  CROWD_REPORT_TURNSTILE_SECRET_KEY?: string;
  CROWD_REPORT_TURNSTILE_HOSTNAME?: string;
  CROWD_REPORT_TURNSTILE_ACTION?: string;
  CROWD_REPORT_RATE_LIMITER?: RateLimit;
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

export const Route = createFileRoute('/api/reports')({
  server: {
    handlers: {
      async POST({ request }) {
        const runtimeEnv = getRuntimeEnv();
        if (
          !isCrowdReportsFeatureEnabled(runtimeEnv as CrowdReportFeatureEnv, {
            isLocalDev: import.meta.env.DEV,
          })
        ) {
          return Response.json(
            { success: false, error: 'Crowd reports are not available' },
            { status: 404 },
          );
        }

        const hashSalt =
          runtimeEnv.CROWD_REPORT_HASH_SALT ??
          (import.meta.env.DEV ? 'development-crowd-report-salt' : undefined);
        if (!hashSalt) {
          return Response.json(
            { success: false, error: 'Crowd reports are not configured' },
            { status: 503 },
          );
        }

        const parsedBody = await parseCrowdReportJsonBody(request);
        if (!parsedBody.success) {
          return Response.json(
            { success: false, error: parsedBody.error },
            { status: parsedBody.status },
          );
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
          {
            expectedHostname:
              runtimeEnv.CROWD_REPORT_TURNSTILE_HOSTNAME ??
              new URL(request.url).hostname,
            expectedAction: runtimeEnv.CROWD_REPORT_TURNSTILE_ACTION,
          },
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

        const nativeRateLimiter = runtimeEnv.CROWD_REPORT_RATE_LIMITER;
        if (nativeRateLimiter) {
          try {
            const { success } = await nativeRateLimiter.limit({
              key: abuseContext.ipHash,
            });
            if (!success) {
              return Response.json(
                {
                  success: false,
                  error: 'Too many reports submitted from this network',
                },
                {
                  status: 429,
                  headers: {
                    'retry-after': String(60),
                  },
                },
              );
            }
          } catch (error) {
            console.warn('Native crowd report rate limiter failed', { error });
          }
        }

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
