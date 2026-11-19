import {
  EstimatedFrequencyProfileSchema,
  LinePlatformDoorCountSchema,
  LineTypeSchema,
  OperatingHoursSchema,
  StationFirstLastTrainSchema,
  StationStructureTypeSchema,
} from '@mrtdown/core';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  stationCodesTable as codes,
  stationLandmarksTable as landmarks,
  lineOperatorsTable as lineOperators,
  linesTable as lines,
  serviceRevisionsTable as revisions,
  servicesTable as services,
  stationsTable as stations,
} from '~/db/schema';
import { type AppDbReader, timeDbQuery } from './database';

const id = z.string().min(1);
const date = z.iso.date();
// Match parseTranslations, including legacy English fallback and missing locales.
const name = z.record(z.string(), z.string().nullable());

export const RangeReferenceRowsSchema = z.object({
  lines: z.array(
    z.object({
      id,
      name,
      type: LineTypeSchema,
      color: z.string(),
      started_at: date.nullable(),
      platform_door_count: LinePlatformDoorCountSchema,
      // Empty arrays mean unknown in the read model.
      train_car_counts: z.array(z.number().int().positive()),
      operating_hours: OperatingHoursSchema.nullable(),
    }),
  ),
  lineOperators: z.array(
    z.object({
      line_id: id,
      operator_id: id,
      started_at: date.nullable(),
      ended_at: date.nullable(),
    }),
  ),
  services: z.array(z.object({ id, line_id: id, name })),
  revisions: z.array(
    z.object({
      id,
      service_id: id,
      start_at: date.nullable(),
      end_at: date.nullable(),
      estimated_frequency: EstimatedFrequencyProfileSchema.nullable(),
      updated_at: z.iso.datetime(),
    }),
  ),
  stations: z.array(
    z.object({
      id,
      name,
      townId: id,
      firstLastTrain: StationFirstLastTrainSchema.nullable(),
      latitude: z.number().finite(),
      longitude: z.number().finite(),
    }),
  ),
  stationCodes: z.array(
    z.object({
      line_id: id,
      station_id: id,
      code: z.string(),
      started_at: date,
      ended_at: date.nullable(),
      structure_type: StationStructureTypeSchema,
    }),
  ),
  stationLandmarks: z.array(z.object({ station_id: id, landmark_id: id })),
});

export type RangeReferenceRows = z.infer<typeof RangeReferenceRowsSchema>;

/** Only canonical inputs used by range assembly; no issues or holiday calendar. */
export async function readRangeReferenceRows(
  db: AppDbReader,
): Promise<RangeReferenceRows> {
  const [
    lineRows,
    operatorRows,
    serviceRows,
    revisionRows,
    stationRows,
    codeRows,
    landmarkRows,
  ] = await Promise.all([
    timeDbQuery('dataset_q_lines', () =>
      db
        .select({
          id: lines.id,
          name: lines.name,
          type: lines.type,
          color: lines.color,
          started_at: lines.started_at,
          platform_door_count: lines.platform_door_count,
          train_car_counts: lines.train_car_counts,
          operating_hours: lines.operating_hours,
        })
        .from(lines),
    ),
    timeDbQuery('dataset_q_line_operators', () =>
      db
        .select({
          line_id: lineOperators.line_id,
          operator_id: lineOperators.operator_id,
          started_at: lineOperators.started_at,
          ended_at: lineOperators.ended_at,
        })
        .from(lineOperators),
    ),
    timeDbQuery('dataset_q_services', () =>
      db
        .select({
          id: services.id,
          line_id: services.line_id,
          name: services.name,
        })
        .from(services),
    ),
    timeDbQuery('dataset_q_service_revisions', () =>
      db
        .select({
          id: revisions.id,
          service_id: revisions.service_id,
          start_at: revisions.start_at,
          end_at: revisions.end_at,
          estimated_frequency: revisions.estimated_frequency,
          updated_at: revisions.updated_at,
        })
        .from(revisions),
    ),
    timeDbQuery('dataset_q_stations', () =>
      db
        .select({
          id: stations.id,
          name: stations.name,
          townId: stations.townId,
          firstLastTrain: stations.first_last_train,
          latitude: sql<number>`ST_Y(${stations.geo})`,
          longitude: sql<number>`ST_X(${stations.geo})`,
        })
        .from(stations),
    ),
    timeDbQuery('dataset_q_station_codes', () =>
      db
        .select({
          line_id: codes.line_id,
          station_id: codes.station_id,
          code: codes.code,
          started_at: codes.started_at,
          ended_at: codes.ended_at,
          structure_type: codes.structure_type,
        })
        .from(codes),
    ),
    timeDbQuery('dataset_q_station_landmarks', () =>
      db
        .select({
          station_id: landmarks.station_id,
          landmark_id: landmarks.landmark_id,
        })
        .from(landmarks),
    ),
  ]);
  return {
    lines: lineRows,
    lineOperators: operatorRows,
    services: serviceRows,
    revisions: revisionRows.map((row) => ({
      ...row,
      estimated_frequency: row.estimated_frequency ?? null,
      updated_at: row.updated_at.toISOString(),
    })),
    stations: stationRows.map((row) => ({
      ...row,
      firstLastTrain: row.firstLastTrain ?? null,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    })),
    stationCodes: codeRows,
    stationLandmarks: landmarkRows,
  };
}
