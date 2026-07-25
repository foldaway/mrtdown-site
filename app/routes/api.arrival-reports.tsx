import { createFileRoute } from '@tanstack/react-router';
import { getDb } from '~/db';
import {
  CrowdArrivalReportRateLimitError,
  CrowdArrivalReportSubmissionSchema,
  persistCrowdArrivalReport,
  serviceCallsAtStation,
} from '~/util/crowdArrivalReports';
import {
  getClientIp,
  hashCrowdReportValue,
  parseCrowdReportJsonBody,
} from '~/util/crowdReports';

export const Route = createFileRoute('/api/arrival-reports')({
  server: {
    handlers: {
      async POST({ request }) {
        const hashSalt =
          process.env.CROWD_REPORT_HASH_SALT ??
          (import.meta.env.DEV ? 'development-crowd-report-salt' : undefined);
        if (!hashSalt) {
          return Response.json(
            { success: false, error: 'Arrival reports are not configured' },
            { status: 503 },
          );
        }
        const body = await parseCrowdReportJsonBody(request);
        if (!body.success) {
          return Response.json(
            { success: false, error: body.error },
            { status: body.status },
          );
        }
        const parsed = CrowdArrivalReportSubmissionSchema.safeParse(body.body);
        if (!parsed.success) {
          return Response.json(
            { success: false, error: 'Invalid arrival report' },
            { status: 400 },
          );
        }
        const db = getDb();
        if (!(await serviceCallsAtStation(db, parsed.data))) {
          return Response.json(
            {
              success: false,
              error: 'This service does not call at the station',
            },
            { status: 400 },
          );
        }
        try {
          const report = await persistCrowdArrivalReport(
            db,
            parsed.data,
            await hashCrowdReportValue(getClientIp(request), hashSalt),
          );
          return Response.json(
            { success: true, data: report },
            { status: 201 },
          );
        } catch (error) {
          if (error instanceof CrowdArrivalReportRateLimitError) {
            return Response.json(
              {
                success: false,
                error: 'Please wait before reporting another arrival',
              },
              { status: 429, headers: { 'retry-after': '30' } },
            );
          }
          console.error('Arrival report submission failed', { error });
          return Response.json(
            { success: false, error: 'Arrival report submission failed' },
            { status: 500 },
          );
        }
      },
    },
  },
});
