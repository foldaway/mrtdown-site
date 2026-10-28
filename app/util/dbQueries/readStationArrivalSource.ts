import { Temporal } from '@js-temporal/polyfill';
import { eq, inArray } from 'drizzle-orm';
import type { getDb } from '~/db';
import { servicesTable, stationsTable } from '~/db/schema';
import { buildScheduledStationArrivalLines } from '~/util/scheduledStationArrivals';
import { selectStationArrivalSource } from '~/util/stationArrivalSourcePolicy';
import { isoDate, parseDateTimeUncached } from './dateTime';
import { parseTranslations } from './dataset';
import { withIndexedScheduledDepartures } from './queryIndexedScheduledDepartures';
import type { ScheduledTimetableSnapshotOptions } from './withSelectedScheduledTimetable';

type StationArrivalRequest = ScheduledTimetableSnapshotOptions & {
  referenceInstant: string;
  endInstant: string;
  limit?: number;
};

/** Private exact-scope composition; referenceInstant is also the window's lower bound. */
export async function readStationArrivalSource(
  db: ReturnType<typeof getDb>,
  options: StationArrivalRequest,
) {
  const reference = Temporal.Instant.from(options.referenceInstant);
  const referenceNow = parseDateTimeUncached(reference.toString());
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
      const canonicalStation = topology.stations.find(
        ({ id }) => id === scope.stationId,
      );
      const canonicalDestination = topology.stations.find(
        ({ id }) => id === scope.destinationStationId,
      );
      const canonicalService = topology.services.find(
        ({ id }) => id === scope.serviceId,
      );
      if (
        !station ||
        !destination ||
        !service ||
        !canonicalStation ||
        !canonicalDestination ||
        !canonicalService
      ) {
        throw new Error(
          'Station arrivals require canonical scope metadata in the query snapshot',
        );
      }
      const referenceDate = isoDate(referenceNow);
      const scheduled = buildScheduledStationArrivalLines(result, {
        serviceName: parseTranslations(service.name),
        destinationName: parseTranslations(destination.name),
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
    },
  );
}
