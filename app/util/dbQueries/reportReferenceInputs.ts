import type { Translations } from '@mrtdown/core';
import { asc } from 'drizzle-orm';
import {
  linesTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesTable,
  stationCodesTable,
  stationsTable,
} from '~/db/schema';
import { z } from 'zod';
import type { AppDbReader } from './database';

const id = z.string().min(1);
const date = z.iso.date();
// Preserve raw localized names, including null/legacy locales, just as SQL does.
const name = z
  .record(z.string(), z.string().nullable())
  .transform((value) => value as Translations);
const FormOptionRowsSchema = z.object({
  lines: z.array(
    z.object({
      id,
      name,
      color: z.string(),
      startedAt: date.nullable(),
      endedAt: date.nullable(),
    }),
  ),
  stations: z.array(z.object({ id, name })),
  stationCodes: z.array(
    z.object({
      lineId: id,
      stationId: id,
      code: z.string(),
      startedAt: date,
      endedAt: date.nullable(),
    }),
  ),
  services: z.array(z.object({ id, lineId: id })),
  serviceRevisions: z.array(
    z.object({
      id,
      serviceId: id,
      start_at: date.nullable(),
      end_at: date.nullable(),
      updated_at: z.iso.datetime(),
    }),
  ),
  servicePathEntries: z.array(
    z.object({
      serviceRevisionId: id,
      serviceId: id,
      stationId: id,
      pathIndex: z.number().int().nonnegative(),
    }),
  ),
});

const ReportReferenceInputsSchema = z.object({
  datasetVersion: z.iso.datetime(),
  formOptionRows: FormOptionRowsSchema,
});

export const parseReportReferenceInputs = (value: unknown) =>
  ReportReferenceInputsSchema.parse(value);

/** Shared by SQL fallback and publication; keep SQL ordering and path eligibility. */
export async function readCrowdReportFormOptionRows(db: AppDbReader) {
  const [
    lines,
    stations,
    stationCodes,
    services,
    serviceRevisionRows,
    servicePathEntries,
  ] = await Promise.all([
    db
      .select({
        id: linesTable.id,
        name: linesTable.name,
        color: linesTable.color,
        startedAt: linesTable.started_at,
        endedAt: linesTable.ended_at,
      })
      .from(linesTable)
      .orderBy(asc(linesTable.id)),
    db
      .select({
        id: stationsTable.id,
        name: stationsTable.name,
      })
      .from(stationsTable)
      .orderBy(asc(stationsTable.id)),
    db
      .select({
        lineId: stationCodesTable.line_id,
        stationId: stationCodesTable.station_id,
        code: stationCodesTable.code,
        startedAt: stationCodesTable.started_at,
        endedAt: stationCodesTable.ended_at,
      })
      .from(stationCodesTable)
      .orderBy(asc(stationCodesTable.code)),
    db
      .select({
        id: servicesTable.id,
        lineId: servicesTable.line_id,
      })
      .from(servicesTable)
      .orderBy(asc(servicesTable.id)),
    db
      .select({
        id: serviceRevisionsTable.id,
        serviceId: serviceRevisionsTable.service_id,
        start_at: serviceRevisionsTable.start_at,
        end_at: serviceRevisionsTable.end_at,
        updated_at: serviceRevisionsTable.updated_at,
      })
      .from(serviceRevisionsTable)
      .orderBy(serviceRevisionsTable.service_id, serviceRevisionsTable.id),
    db
      .select({
        serviceRevisionId:
          serviceRevisionPathStationEntriesTable.service_revision_id,
        serviceId: serviceRevisionPathStationEntriesTable.service_id,
        stationId: serviceRevisionPathStationEntriesTable.station_id,
        pathIndex: serviceRevisionPathStationEntriesTable.path_index,
      })
      .from(serviceRevisionPathStationEntriesTable),
  ]);
  const revisionKeysWithPath = new Set(
    servicePathEntries.map(
      ({ serviceId, serviceRevisionId }) =>
        `${serviceId}::${serviceRevisionId}`,
    ),
  );
  const serviceRevisions = serviceRevisionRows.filter((revision) =>
    revisionKeysWithPath.has(`${revision.serviceId}::${revision.id}`),
  );

  return {
    lines,
    stations,
    stationCodes,
    services,
    serviceRevisions,
    servicePathEntries,
  };
}
