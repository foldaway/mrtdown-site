import { and, desc, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import type { getDb } from '~/db';
import {
  crowdArrivalReportsTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
} from '~/db/schema';
import { selectServiceRevisionForReferenceDate } from './serviceRevisions';

const SG_TIMEZONE = 'Asia/Singapore';
const REPORTER_COOLDOWN_SECONDS = 30;

export const CrowdArrivalReportSubmissionSchema = z
  .object({
    stationId: z.string().trim().min(1).max(64),
    serviceId: z.string().trim().min(1).max(64),
    minutesToArrival: z.number().int().min(0).max(30),
  })
  .strict();

export type CrowdArrivalReportSubmission = z.infer<
  typeof CrowdArrivalReportSubmissionSchema
>;

type AppDb = ReturnType<typeof getDb>;

export async function serviceCallsAtStation(
  db: AppDb,
  submission: CrowdArrivalReportSubmission,
  now = DateTime.now().setZone(SG_TIMEZONE),
) {
  const revisions = await db
    .select({
      id: serviceRevisionsTable.id,
      start_at: serviceRevisionsTable.start_at,
      end_at: serviceRevisionsTable.end_at,
      updated_at: serviceRevisionsTable.updated_at,
    })
    .from(serviceRevisionsTable)
    .where(eq(serviceRevisionsTable.service_id, submission.serviceId));
  const referenceDate = now.toISODate();
  if (referenceDate == null) return false;
  const revision = selectServiceRevisionForReferenceDate(
    revisions,
    referenceDate,
  );
  if (revision == null) return false;
  const entries = await db
    .select({ stationId: serviceRevisionPathStationEntriesTable.station_id })
    .from(serviceRevisionPathStationEntriesTable)
    .where(
      and(
        eq(
          serviceRevisionPathStationEntriesTable.service_revision_id,
          revision.id,
        ),
        eq(
          serviceRevisionPathStationEntriesTable.service_id,
          submission.serviceId,
        ),
        eq(
          serviceRevisionPathStationEntriesTable.station_id,
          submission.stationId,
        ),
      ),
    )
    .limit(1);
  return entries.length > 0;
}

export async function persistCrowdArrivalReport(
  db: AppDb,
  submission: CrowdArrivalReportSubmission,
  reporterHash: string,
  now = DateTime.now().setZone(SG_TIMEZONE),
) {
  const recent = await db
    .select({ createdAt: crowdArrivalReportsTable.created_at })
    .from(crowdArrivalReportsTable)
    .where(eq(crowdArrivalReportsTable.reporter_hash, reporterHash))
    .orderBy(desc(crowdArrivalReportsTable.created_at))
    .limit(1);
  const previous = recent[0]?.createdAt;
  if (
    previous != null &&
    now.diff(DateTime.fromJSDate(previous, { zone: SG_TIMEZONE }), 'seconds')
      .seconds < REPORTER_COOLDOWN_SECONDS
  ) {
    throw new CrowdArrivalReportRateLimitError();
  }

  const reportedAt = now.toISO();
  if (reportedAt == null) throw new Error('Unable to determine report time');
  const id = crypto.randomUUID();
  await db.insert(crowdArrivalReportsTable).values({
    id,
    station_id: submission.stationId,
    service_id: submission.serviceId,
    minutes_to_arrival: submission.minutesToArrival,
    reported_at: reportedAt,
    reporter_hash: reporterHash,
    status: 'accepted',
  });
  return { id, reportedAt };
}

export class CrowdArrivalReportRateLimitError extends Error {}
