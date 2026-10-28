import { Temporal } from '@js-temporal/polyfill';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { getDb } from '~/db';
import {
  publicHolidaysTable,
  serviceRevisionsTable,
  servicesTable,
  stationsTable,
} from '~/db/schema';
import { getLatestCrowdArrivalReports } from '~/util/crowdArrivalReports';
import {
  getEstimatedStationArrivalTimings,
  MAX_CROWD_ARRIVAL_REPORT_AGE_MINUTES,
} from '~/util/estimatedArrivals';
import { buildScheduledStationArrivalLines } from '~/util/scheduledStationArrivals';
import {
  selectStationArrivalSource,
  type FrequencyArrivalCandidate,
} from '~/util/stationArrivalSourcePolicy';
import {
  selectServiceRevisionForReferenceDate,
  serviceRevisionIsActiveOn,
} from '~/util/serviceRevisions';
import { isoDate, isoDateTime, parseDateTimeUncached } from './dateTime';
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
      const { scope, window } = result;
      const stationRows = await tx
        .select({
          id: stationsTable.id,
          name: stationsTable.name,
          firstLastTrain: stationsTable.first_last_train,
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
      // The policy decides whether a candidate is useful before reading its inputs.
      const decision = selectStationArrivalSource(scheduled, null);
      if (
        decision.source !== 'unavailable' ||
        decision.reason !== 'frequency-unavailable' ||
        scope.platformId !== undefined
      ) {
        return decision;
      }
      const revisions = await tx
        .select({
          id: serviceRevisionsTable.id,
          start_at: serviceRevisionsTable.start_at,
          end_at: serviceRevisionsTable.end_at,
          updated_at: serviceRevisionsTable.updated_at,
          estimatedFrequency: serviceRevisionsTable.estimated_frequency,
        })
        .from(serviceRevisionsTable)
        .where(eq(serviceRevisionsTable.service_id, scope.serviceId));
      const revision = selectServiceRevisionForReferenceDate(
        revisions,
        referenceDate,
      );
      const path = canonicalService.revisions.find(
        ({ id }) => id === revision?.id,
      )?.stations;
      const destinationEntry = path?.at(-1);
      // The existing estimator considers yesterday/today/tomorrow with one revision.
      // Decline fallback at a revision boundary rather than estimate another path/profile.
      const stableRevision =
        revision != null &&
        [-1, 0, 1].every((offset) => {
          const date = isoDate(referenceNow.plus({ days: offset }));
          return (
            serviceRevisionIsActiveOn(revision, date) &&
            selectServiceRevisionForReferenceDate(revisions, date)?.id ===
              revision.id
          );
        });
      if (
        !stableRevision ||
        !path?.some(({ stationId }) => stationId === scope.stationId) ||
        destinationEntry?.stationId !== scope.destinationStationId
      ) {
        return decision;
      }
      const holidays = await tx
        .select({ date: publicHolidaysTable.date })
        .from(publicHolidaysTable)
        .where(
          and(
            gte(
              publicHolidaysTable.date,
              isoDate(referenceNow.minus({ days: 1 })),
            ),
            lte(
              publicHolidaysTable.date,
              isoDate(referenceNow.plus({ days: 1 })),
            ),
          ),
        );
      const crowdReports = await getLatestCrowdArrivalReports({
        db: tx,
        stationId: scope.stationId,
        serviceIds: [scope.serviceId],
        reportedAtOrAfter: isoDateTime(
          referenceNow.minus({ minutes: MAX_CROWD_ARRIVAL_REPORT_AGE_MINUTES }),
        ),
      });
      const [timing] = getEstimatedStationArrivalTimings({
        station: {
          id: station.id,
          firstLastTrain: station.firstLastTrain ?? undefined,
        },
        services: [
          {
            serviceId: scope.serviceId,
            lineId: scope.lineId,
            serviceName: parseTranslations(service.name),
            destinationStationId: scope.destinationStationId,
            destinationName: parseTranslations(destination.name),
            destinationCode: destinationEntry.displayCode,
            revision: {
              path: { stations: path },
              estimatedFrequency: revision.estimatedFrequency ?? undefined,
            },
          },
        ],
        referenceNow,
        publicHolidayDates: new Set(holidays.map(({ date }) => date)),
        crowdReports,
      });
      let frequency: FrequencyArrivalCandidate | null = null;
      if (timing) {
        const departures = timing.departures
          .filter(
            ({ time }) =>
              Temporal.Instant.compare(time, window.startInstant) >= 0 &&
              Temporal.Instant.compare(time, window.endInstant) < 0,
          )
          .slice(0, options.limit);
        if (departures.length > 0) {
          frequency = {
            stationId: scope.stationId,
            window,
            timing: {
              ...timing,
              departures,
              platformLabels: [
                ...new Set(
                  canonicalStation.platforms
                    .filter(
                      (platform) =>
                        platform.boardingStatus == null &&
                        platform.lineId === scope.lineId &&
                        platform.serviceIds.includes(scope.serviceId),
                    )
                    .map(({ label }) => label),
                ),
              ].sort((a, b) => a.localeCompare(b)),
            },
          };
        }
      }
      return selectStationArrivalSource(scheduled, frequency);
    },
  );
}
