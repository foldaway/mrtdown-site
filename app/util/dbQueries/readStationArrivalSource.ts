import { Temporal } from '@js-temporal/polyfill';
import { eq, inArray } from 'drizzle-orm';
import type { getDb } from '~/db';
import { servicesTable, stationsTable } from '~/db/schema';
import { buildScheduledStationArrivalLines } from '~/util/scheduledStationArrivals';
import { selectStationArrivalSource } from '~/util/stationArrivalSourcePolicy';
import { isoDate, parseDateTimeUncached } from './dateTime';
import { parseTranslations } from './dataset';
import {
  withIndexedScheduledDepartures,
  type IndexedDepartures,
} from './queryIndexedScheduledDepartures';
import type {
  Topology,
  ScheduledTimetableSnapshotOptions,
} from './withSelectedScheduledTimetable';

export type StationArrivalRequest = ScheduledTimetableSnapshotOptions & {
  referenceInstant: string;
  endInstant: string;
  limit?: number;
};

/** Private exact-scope composition; referenceInstant is also the window's lower bound. */
export async function readStationArrivalSource(
  db: ReturnType<typeof getDb>,
  options: StationArrivalRequest,
) {
  return withIndexedScheduledDepartures(
    db,
    { ...options, startInstant: options.referenceInstant },
    async (tx, result, topology) => {
      const { scope } = result;
      const stationRows = await tx
        .select({
          id: stationsTable.id,
          name: stationsTable.name,
        })
        .from(stationsTable)
        .where(
          inArray(stationsTable.id, [
            scope.stationId,
            scope.destinationStationId,
          ]),
        );
      const [service] = await tx
        .select({ name: servicesTable.name })
        .from(servicesTable)
        .where(eq(servicesTable.id, scope.serviceId));
      const station = stationRows.find(({ id }) => id === scope.stationId);
      const destination = stationRows.find(
        ({ id }) => id === scope.destinationStationId,
      );
      if (!station || !destination || !service)
        throw new Error('Missing arrival display metadata');
      return assembleStationArrivalSource(result, topology, {
        serviceName: parseTranslations(service.name),
        destinationName: parseTranslations(destination.name),
      });
    },
  );
}

/** Display labels come from the same publication or SQL snapshot as selection. */
export function assembleStationArrivalSource(
  result: IndexedDepartures,
  topology: Topology,
  names: Pick<
    Parameters<typeof buildScheduledStationArrivalLines>[1],
    'serviceName' | 'destinationName'
  >,
) {
  const { scope } = result;
  const reference = Temporal.Instant.from(result.window.startInstant);
  const referenceNow = parseDateTimeUncached(reference.toString());
  const canonicalStation = topology.stations.find(
    ({ id }) => id === scope.stationId,
  );
  const canonicalDestination = topology.stations.find(
    ({ id }) => id === scope.destinationStationId,
  );
  const canonicalService = topology.services.find(
    ({ id }) => id === scope.serviceId,
  );
  if (!canonicalStation || !canonicalDestination || !canonicalService) {
    throw new Error(
      'Station arrivals require canonical scope metadata in the query snapshot',
    );
  }
  const referenceDate = isoDate(referenceNow);
  const scheduled = buildScheduledStationArrivalLines(result, {
    serviceName: names.serviceName,
    destinationName: names.destinationName,
    destinationCode:
      canonicalDestination.stationCodes.find(
        (code) =>
          code.lineId === scope.lineId &&
          code.startedAt != null &&
          code.startedAt <= referenceDate &&
          (code.endedAt == null || referenceDate < code.endedAt),
      )?.code ?? scope.destinationStationId,
    platformLabelsById: new Map(
      canonicalStation.platforms.map(({ id, label }) => [id, label]),
    ),
  });
  return selectStationArrivalSource(scheduled);
}
