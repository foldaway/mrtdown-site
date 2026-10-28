import { StationSchema } from '@mrtdown/core';
import { z } from 'zod';
import type { StationArrivalsV2 } from '~/util/stationArrivalsV2';

const instant = z.iso.datetime({ offset: true });
const identity = {
  manifestSha256: z.string(),
  snapshotSha256: z.string(),
};
const display = {
  serviceName: StationSchema.shape.name,
  destinationName: StationSchema.shape.name.nullable(),
  destinationCode: z.string(),
};
// Codes are retained for provenance, but are never used as passenger copy.
const reason = z.custom<
  StationArrivalsV2['coverage']['unavailableReasons'][number]
>((value) => typeof value === 'string');
const common = {
  schemaVersion: z.literal(2),
  scope: z.object({
    stationId: z.string(),
    lineId: z.string(),
    serviceId: z.string(),
    destinationStationId: z.string(),
    platformId: z.string().optional(),
  }),
  window: z.object({
    startInstant: instant,
    endInstant: instant,
    limit: z.literal(20),
  }),
  coverage: z.object({
    complete: z.boolean(),
    untimedDepartureCount: z.number().int().nonnegative(),
    serviceDays: z.array(
      z.object({
        serviceDate: z.iso.date(),
        source: z.object(identity).nullable(),
        reasons: z.array(reason),
        rollback: z
          .object({
            status: z.enum(['not-applicable', 'rejected', 'applied']),
            blockers: z.array(z.string()),
          })
          .nullable(),
      }),
    ),
    unavailableReasons: z.array(reason),
  }),
};
const responseSchema: z.ZodType<StationArrivalsV2> = z.discriminatedUnion(
  'source',
  [
    z.object({
      ...common,
      source: z.literal('scheduled'),
      reason: z.enum(['complete', 'incomplete']),
      timings: z.array(
        z.object({
          ...display,
          platforms: z.array(z.object({ id: z.string(), label: z.string() })),
          departures: z.array(
            z.object({
              ...identity,
              time: instant,
              basis: z.literal('scheduled'),
              precision: z.enum(['exact', 'approximate']),
              serviceDate: z.iso.date(),
              providerTripId: z.string(),
              providerStopId: z.string(),
              stopSequence: z.string(),
              revisionId: z.string(),
            }),
          ),
        }),
      ),
    }),
    z.object({
      ...common,
      source: z.literal('unavailable'),
      reason: z.literal('timetable-unavailable'),
    }),
  ],
);

export function parseArrivalResponse(
  payload: unknown,
  scope: StationArrivalsV2['scope'],
) {
  const { data } = z
    .object({ success: z.literal(true), data: responseSchema })
    .parse(payload);
  if (
    data.scope.stationId !== scope.stationId ||
    data.scope.lineId !== scope.lineId ||
    data.scope.serviceId !== scope.serviceId ||
    data.scope.destinationStationId !== scope.destinationStationId ||
    data.scope.platformId !== undefined
  ) {
    throw new Error('Arrival response scope mismatch');
  }
  return data;
}
