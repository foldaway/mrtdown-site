import { createFileRoute } from '@tanstack/react-router';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { getDb } from '~/db';
import { getCrowdReportRateLimiter } from '~/limiters/crowdReport';
import {
  buildCrowdReportAbuseContext,
  CrowdReportRateLimitError,
  findMissingCrowdReportReferences,
  getClientIp,
  parseCrowdReportJsonBody,
  persistAutomoderatedCrowdReport,
  validateCrowdReportSubmission,
  verifyTurnstileToken,
} from '~/util/crowdReports';

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
        const hashSalt =
          process.env.CROWD_REPORT_HASH_SALT ??
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
          process.env.CROWD_REPORT_TURNSTILE_SECRET_KEY ??
            process.env.TURNSTILE_SECRET_KEY,
          validation.data.turnstileToken,
          getClientIp(request),
          {
            expectedHostname:
              process.env.CROWD_REPORT_TURNSTILE_HOSTNAME ??
              new URL(request.url).hostname,
            expectedAction: process.env.CROWD_REPORT_TURNSTILE_ACTION,
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

        const rateLimiter = getCrowdReportRateLimiter();
        try {
          await rateLimiter.consume(abuseContext.ipHash, 1);
        } catch (error) {
          if (!(error instanceof RateLimiterRes)) {
            console.error('Crowd report rate limiter store failed', error);
          } else {
            return Response.json(
              {
                success: false,
                error: 'Too many reports submitted from this network',
              },
              {
                status: 429,
                headers: {
                  'retry-after': String(Math.ceil(error.msBeforeNext / 1000)),
                },
              },
            );
          }

          // The database-backed limiter below still protects this endpoint if
          // Redis is temporarily unavailable.
        }

        const db = getDb();
        const missingReferences = await findMissingCrowdReportReferences(
          db,
          validation.data,
        );
        if (
          missingReferences.lineIds.length > 0 ||
          missingReferences.stationIds.length > 0 ||
          missingReferences.directionStationIds.length > 0
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
          const report = await persistAutomoderatedCrowdReport(
            db,
            validation.data,
            abuseContext,
            {
              rateLimitPerHour: getRateLimitPerHour(
                process.env.CROWD_REPORT_RATE_LIMIT_PER_HOUR,
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
