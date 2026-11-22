import {
  scheduledServiceDayInstant,
  ScheduledStopTimeSchema,
} from '@mrtdown/core';
import { createSelectSchema } from 'drizzle-orm/zod';
import { z } from 'zod';
import { combinedDepartureOccurrencesTable } from '~/db/scheduledDepartures.schema';

export const MAX_DEPARTURE_TEMPLATES = 20_000;
export const DEPARTURE_PARTITION_LIMITS = {
  encodedBytes: 2 * 1024 * 1024,
  jsonBytes: 8 * 1024 * 1024,
};
const id = z.string().min(1);
const boarding = z.object({
  serviceId: id,
  revisionId: id,
  platformIds: z.array(id).min(1),
});
const callSchema = createSelectSchema(combinedDepartureOccurrencesTable)
  .omit({
    projection_id: true,
    station_id: true,
    service_date: true,
    arrival_instant: true,
    departure_instant: true,
  })
  .extend({
    arrival_seconds: ScheduledStopTimeSchema.shape.arrivalSeconds,
    departure_seconds: ScheduledStopTimeSchema.shape.departureSeconds,
    pickup_type: ScheduledStopTimeSchema.shape.pickupType,
    drop_off_type: ScheduledStopTimeSchema.shape.dropOffType,
    timepoint: ScheduledStopTimeSchema.shape.timepoint,
    stop_sequence: ScheduledStopTimeSchema.shape.stopSequence,
    boardingByService: z.array(boarding).min(1),
    serviceDates: z.array(z.iso.date()).min(1).max(10_000),
  });
export const departurePartitionSchema = z.object({
  projectionId: z.number().int().positive(),
  stationId: id,
  calls: z.array(callSchema).max(MAX_DEPARTURE_TEMPLATES),
});
export type DeparturePartition = z.infer<typeof departurePartitionSchema>;
export function parseDeparturePartition(value: unknown): DeparturePartition {
  const partition = departurePartitionSchema.parse(value);
  for (const call of partition.calls) {
    if (
      call.pickup_type === 1 ||
      call.occurrence_index < 0 ||
      call.serviceDates.some((date, i, dates) => i > 0 && date <= dates[i - 1])
    )
      throw new Error('Invalid departure partition call');
  }
  return partition;
}

export function* expandDeparturePartition(partition: DeparturePartition) {
  for (const { serviceDates, ...call } of partition.calls) {
    for (const serviceDate of serviceDates) {
      yield {
        ...call,
        projection_id: partition.projectionId,
        station_id: partition.stationId,
        service_date: serviceDate,
        arrival_instant:
          call.arrival_seconds === null
            ? null
            : scheduledServiceDayInstant(serviceDate, call.arrival_seconds),
        departure_instant:
          call.departure_seconds === null
            ? null
            : scheduledServiceDayInstant(serviceDate, call.departure_seconds),
      };
    }
  }
}
