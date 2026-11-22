import {
  LineTypeSchema,
  StationLayoutPlatformSchema,
  TranslationsSchema,
} from '@mrtdown/core';
import { hashBytes, ScheduledTimetableImportRecordSchema } from '@mrtdown/fs';
import { createSelectSchema } from 'drizzle-orm/zod';
import { z } from 'zod';
import { CanonicalTopologyAttestationSchema } from '~/db/canonicalTopologyPromotion';
import {
  scheduledDepartureDaysTable,
  scheduledDepartureScopesTable,
} from '~/db/scheduledDepartures.schema';
import {
  COMBINED_DEPARTURE_PROJECTOR_VERSION,
  SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
} from './projectScheduledTimetable';
import { validateScheduledTimetableHistory } from './scheduledTimetableHistory';
import {
  indexedServiceIds,
  type TimetableCoverageRow,
} from './scheduledTimetableSelection';
import type { IndexedTimetableScope } from './withSelectedScheduledTimetable';

export const MAX_ARRIVAL_SCOPE_ROWS = 100_000;
export const MAX_ARRIVAL_DAY_ROWS = 10_000;
export const MAX_ARRIVAL_VERSIONS = 100;
const id = z.string().min(1);
const date = z.iso.date();
const digest = z.string().regex(/^[a-f0-9]{64}$/);

// Field order matches readLiveScheduleTopology's attested projection encoding.
const topologySchema = z.object({
  projectionVersion: z.literal(1),
  operators: z.array(z.object({ id })),
  lines: z.array(
    z.object({
      id,
      type: LineTypeSchema,
      serviceIds: z.array(id),
      operators: z.array(
        z.object({
          operatorId: id,
          startedAt: date.nullable(),
          endedAt: date.nullable(),
        }),
      ),
    }),
  ),
  stations: z.array(
    z.object({
      id,
      stationCodes: z.array(
        z.object({
          lineId: id,
          code: id,
          startedAt: date,
          endedAt: date.nullable(),
        }),
      ),
      platforms: z.array(
        z.object({
          id,
          label: z.string(),
          lineId: id,
          serviceIds: z.array(id),
          boardingStatus: StationLayoutPlatformSchema.shape.boardingStatus
            .unwrap()
            .nullable(),
        }),
      ),
    }),
  ),
  services: z.array(
    z.object({
      id,
      lineId: id,
      revisions: z.array(
        z.object({
          id,
          startAt: date,
          endAt: date.nullable(),
          stations: z.array(
            z.object({ stationId: id, displayCode: z.string() }),
          ),
        }),
      ),
    }),
  ),
});

const inputsSchema = z.object({
  attestation: CanonicalTopologyAttestationSchema,
  topology: topologySchema,
  history: z
    .array(
      z.object({
        hash: digest,
        predecessor: digest.nullable(),
        receipt: ScheduledTimetableImportRecordSchema,
        manifestBase64: z.base64(),
        combinedRelease: z.unknown(),
      }),
    )
    .max(MAX_ARRIVAL_VERSIONS),
  projections: z
    .array(
      z.object({
        id: z.number().int().positive(),
        manifestSha256: digest,
        projectorVersion: z.number().int().positive(),
        topologySha256: digest,
        topologyProjectionVersion: z.number().int().positive(),
        startDate: date,
        endDate: date,
        maximumDepartureSeconds: z.number().int().nonnegative().safe(),
        completedAt: z.string().nullable(),
      }),
    )
    .max(MAX_ARRIVAL_VERSIONS),
  days: z
    .array(createSelectSchema(scheduledDepartureDaysTable))
    .max(MAX_ARRIVAL_DAY_ROWS),
  scopes: z
    .array(createSelectSchema(scheduledDepartureScopesTable))
    .max(MAX_ARRIVAL_SCOPE_ROWS),
  stationNames: z.array(z.object({ id, name: TranslationsSchema })),
  serviceNames: z.array(z.object({ id, name: TranslationsSchema })),
});

export type ArrivalInputs = z.infer<typeof inputsSchema>;

export function selectArrivalInputCoverage(
  inputs: ArrivalInputs,
  scope: IndexedTimetableScope,
  serviceDate: string,
  loop = false,
): TimetableCoverageRow[] {
  const services = new Set(indexedServiceIds(scope));
  return inputs.days
    .filter((day) => day.service_date === serviceDate)
    .flatMap((day) => {
      const matched = inputs.scopes.filter(
        (row) =>
          row.projection_id === day.projection_id &&
          row.service_date === serviceDate &&
          row.station_id === scope.stationId &&
          row.line_id === scope.lineId &&
          services.has(row.service_id) &&
          (loop || row.destination_station_id === scope.destinationStationId),
      );
      return (matched.length ? matched : [null]).map((row) => ({
        projectionId: day.projection_id,
        serviceDate,
        activeTripCount: day.active_trip_count,
        unassignedActiveTripCount: day.unassigned_active_trip_count,
        serviceId: row?.service_id ?? null,
        destinationId: row?.destination_station_id ?? null,
        platformIds: row?.platform_ids ?? null,
      }));
    });
}

export function readArrivalInputHistory(inputs: ArrivalInputs) {
  return validateScheduledTimetableHistory(
    inputs.history.map(({ manifestBase64, ...row }) => ({
      ...row,
      manifestBytes: Buffer.from(manifestBase64, 'base64'),
    })),
  );
}

export function parseArrivalInputs(value: unknown): ArrivalInputs {
  const inputs = inputsSchema.parse(value);
  if (
    hashBytes(Buffer.from(JSON.stringify(inputs.topology))) !==
    inputs.attestation.sha256
  ) {
    throw new Error(
      'Arrival inputs disagree with the canonical topology attestation',
    );
  }
  const history = readArrivalInputHistory(inputs);
  for (const version of history) {
    if (
      version.manifest.identity.topology.sha256 !== inputs.attestation.sha256 ||
      version.manifest.identity.topology.projectionVersion !==
        inputs.attestation.projectionVersion
    )
      continue;
    const projectorVersion =
      version.format === 'combined'
        ? COMBINED_DEPARTURE_PROJECTOR_VERSION
        : SCHEDULED_DEPARTURE_PROJECTOR_VERSION;
    const projection = inputs.projections.find(
      (row) =>
        row.manifestSha256 === version.manifestSha256 &&
        row.projectorVersion === projectorVersion,
    );
    if (projection?.completedAt === null) {
      throw new Error('Arrival inputs require completed timetable projections');
    }
  }
  return inputs;
}
