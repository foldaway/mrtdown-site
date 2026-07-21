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
  destinationCode: string;
  destinationName: Station['name'] | null;
  revision: Pick<ServiceRevision, 'path' | 'estimatedFrequency'>;
};

export type EstimatedArrivalTiming = {
  serviceId: string;
  lineId: string;
  destinationCode: string;
  destinationName: Station['name'] | null;
  firstTrainTime: string | null;
  lastTrainTime: string | null;
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
        const currentSchedule = schedules[1]?.schedule;
        const departures = schedules
          .flatMap(({ serviceDate, schedule }) => {
            const startOfServiceDay = serviceDate.startOf('day');
            return enumerateEstimatedStationDepartures(schedule).map(
              (departure) =>
                isoDateTime(
                  startOfServiceDay.plus({ seconds: departure.seconds }),
                ),
            );
          })
          .filter((departure) => Date.parse(departure) >= referenceMillis)
          .sort((a, b) => a.localeCompare(b))
          .slice(0, 2);

        return departures.length > 0
          ? [
              {
                serviceId: service.serviceId,
                lineId: service.lineId,
                destinationCode: service.destinationCode,
                destinationName: service.destinationName,
                firstTrainTime: currentSchedule?.firstTrainTime ?? null,
                lastTrainTime: currentSchedule?.lastTrainTime ?? null,
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
