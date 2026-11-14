import { createFileRoute } from '@tanstack/react-router';
import { getDb } from '~/db';
import { getClientIp } from '~/util/clientIp';
import {
  CROWD_ARRIVAL_COOLDOWN_SECONDS,
  crowdArrivalSubmissionSchema,
} from '~/util/crowdArrivalReportContract';
import {
  CrowdArrivalRateLimitError,
  InvalidCrowdArrivalScopeError,
  submitCrowdArrival,
} from '~/util/crowdArrivalReports';
import {
  hashCrowdReportValue,
  parseCrowdReportJsonBody,
} from '~/util/crowdReports';

const headers = { 'cache-control': 'no-store' };

function rejectReport(error: string, status: number) {
  return Response.json({ success: false, error }, { status, headers });
}

export const Route = createFileRoute('/api/arrival-reports')({
  server: {
    handlers: {
      async POST({ request }) {
        const hashSalt =
          process.env.CROWD_REPORT_HASH_SALT ??
          (import.meta.env.DEV ? 'development-crowd-report-salt' : undefined);
        if (!hashSalt)
          return rejectReport('Arrival reports are not configured', 503);

        const mediaType = request.headers.get('content-type')?.split(';')[0];
        if (mediaType?.trim().toLowerCase() !== 'application/json') {
          return rejectReport('Arrival reports require JSON', 415);
        }

        const body = await parseCrowdReportJsonBody(request, 2048);
        if (!body.success) return rejectReport(body.error, body.status);
        const parsed = crowdArrivalSubmissionSchema.safeParse(body.body);
        if (!parsed.success) return rejectReport('Invalid arrival report', 400);

        try {
          const reporterHash = await hashCrowdReportValue(
            getClientIp(request),
            hashSalt,
          );
          await submitCrowdArrival(getDb(), parsed.data, reporterHash);
          return Response.json({ success: true }, { status: 201, headers });
        } catch (error) {
          if (error instanceof InvalidCrowdArrivalScopeError) {
            return rejectReport('Invalid arrival scope', 400);
          }
          if (error instanceof CrowdArrivalRateLimitError) {
            return Response.json(
              {
                success: false,
                error: 'Please wait before reporting another arrival',
              },
              {
                status: 429,
                headers: {
                  ...headers,
                  'retry-after': String(CROWD_ARRIVAL_COOLDOWN_SECONDS),
                },
              },
            );
          }
          console.error('Arrival report submission failed', { error });
          return rejectReport('Arrival report submission failed', 500);
        }
      },
    },
  },
});
