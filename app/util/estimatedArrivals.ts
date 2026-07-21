import {
  enumerateEstimatedStationDepartures,
  generateEstimatedStationFrequencySchedule,
  type EstimatedStationScheduleCalendar,
  type ServiceRevision,
  type Station,
} from '@mrtdown/core';
import type { DateTime } from 'luxon';
import { isoDate, isoDateTime } from './dbQueries/dateTime';

export type EstimatedArrivalService = {
  serviceId: string;
  lineId: string;
  destinationStationId: string | null;
  destinationCode: string;
  destinationName: Station['name'] | null;
  revision: Pick<ServiceRevision, 'path' | 'estimatedFrequency'>;
};

export type EstimatedArrivalTiming = {
  serviceId: string;
  lineId: string;
  destinationStationId: string | null;
  destinationCode: string;
  destinationName: Station['name'] | null;
  firstTrainTime: string | null;
  lastTrainTime: string | null;
  isServiceEnded: boolean;
  nextServiceStart: string | null;
  departures: string[];
};

function calendarForDate(
  date: DateTime,
  publicHolidayDates: ReadonlySet<string>,
) {
  if (date.weekday === 7 || publicHolidayDates.has(isoDate(date))) {
    return 'sunday_public_holiday' as const;
  }
  return date.weekday === 6 ? ('saturday' as const) : ('weekday' as const);
}

function scheduleForServiceDate(input: {
  station: Pick<Station, 'id' | 'firstLastTrain'>;
  service: EstimatedArrivalService;
  calendar: EstimatedStationScheduleCalendar;
}) {
  return generateEstimatedStationFrequencySchedule({
    serviceId: input.service.serviceId,
    revision: input.service.revision,
    station: input.station,
    calendar: input.calendar,
  });
}

/**
 * Returns the next two deterministic frequency estimates for every service at
 * a station. A service day may run past midnight, so the previous, current,
 * and following calendar dates are considered.
 */
export function getEstimatedStationArrivalTimings(input: {
  station: Pick<Station, 'id' | 'firstLastTrain'>;
  services: readonly EstimatedArrivalService[];
  referenceNow: DateTime;
  publicHolidayDates: ReadonlySet<string>;
}): EstimatedArrivalTiming[] {
  const serviceDates = [-1, 0, 1].map((offset) =>
    input.referenceNow.startOf('day').plus({ days: offset }),
  );
  const referenceMillis = input.referenceNow.toMillis();

  return input.services
    .flatMap((service) => {
      try {
        if (service.revision.estimatedFrequency == null) {
          return [];
        }
        const schedules = serviceDates.map((serviceDate) => ({
          serviceDate,
          schedule: scheduleForServiceDate({
            station: input.station,
            service,
            calendar: calendarForDate(serviceDate, input.publicHolidayDates),
          }),
        }));
        const scheduleDepartures = schedules.map(
          ({ serviceDate, schedule }) => {
            const startOfServiceDay = serviceDate.startOf('day');
            const departures = enumerateEstimatedStationDepartures(
              schedule,
            ).map((departure) => ({
              seconds: departure.seconds,
              time: isoDateTime(
                startOfServiceDay.plus({ seconds: departure.seconds }),
              ),
            }));
            return { serviceDate, schedule, departures };
          },
        );
        const currentSchedule = scheduleDepartures[1]?.schedule;
        const allDepartures = scheduleDepartures
          .flatMap(({ departures }) => departures)
          .sort((a, b) => a.time.localeCompare(b.time));
        const departures = allDepartures
          .map((departure) => departure.time)
          .filter((departure) => Date.parse(departure) >= referenceMillis)
          .slice(0, 2);
        const isServiceEnded = !scheduleDepartures.some(
          ({ serviceDate, departures: scheduledDepartures }) => {
            const firstDeparture = scheduledDepartures[0];
            const lastDeparture = scheduledDepartures.at(-1);
            if (firstDeparture == null || lastDeparture == null) {
              return false;
            }
            const startOfServiceDay = serviceDate.startOf('day');
            return (
              startOfServiceDay
                .plus({ seconds: firstDeparture.seconds })
                .toMillis() <= referenceMillis &&
              referenceMillis <=
                startOfServiceDay
                  .plus({ seconds: lastDeparture.seconds })
                  .toMillis()
            );
          },
        );
        const nextServiceStart = scheduleDepartures
          .flatMap(({ serviceDate, departures: scheduledDepartures }) => {
            const firstDeparture = scheduledDepartures[0];
            return firstDeparture == null
              ? []
              : [
                  isoDateTime(
                    serviceDate
                      .startOf('day')
                      .plus({ seconds: firstDeparture.seconds }),
                  ),
                ];
          })
          .find((departure) => Date.parse(departure) > referenceMillis);

        return departures.length > 0
          ? [
              {
                serviceId: service.serviceId,
                lineId: service.lineId,
                destinationStationId: service.destinationStationId,
                destinationCode: service.destinationCode,
                destinationName: service.destinationName,
                firstTrainTime: currentSchedule?.firstTrainTime ?? null,
                lastTrainTime: currentSchedule?.lastTrainTime ?? null,
                isServiceEnded,
                nextServiceStart: nextServiceStart ?? null,
                departures,
              },
            ]
          : [];
      } catch {
        // An invalid or incomplete source profile must not make the station
        // page unavailable; omit that service until the canonical data is fixed.
        return [];
      }
    })
    .sort((a, b) => {
      const nextDepartureDiff =
        Date.parse(a.departures[0] ?? '') - Date.parse(b.departures[0] ?? '');
      return nextDepartureDiff !== 0
        ? nextDepartureDiff
        : a.serviceId.localeCompare(b.serviceId);
    });
}
