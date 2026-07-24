import {
  estimateNextStationArrivals,
  type EstimatedStationArrival,
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
  serviceName: Station['name'];
  destinationStationId: string | null;
  destinationCode: string;
  destinationName: Station['name'] | null;
  revision: Pick<ServiceRevision, 'path' | 'estimatedFrequency'>;
};

export type EstimatedArrivalTiming = {
  serviceId: string;
  lineId: string;
  serviceName: Station['name'];
  destinationStationId: string | null;
  destinationCode: string;
  destinationName: Station['name'] | null;
  firstTrainTime: string | null;
  lastTrainTime: string | null;
  isServiceEnded: boolean;
  nextServiceStart: string | null;
  departures: EstimatedArrivalDeparture[];
};

export type EstimatedArrivalDeparture = Pick<
  EstimatedStationArrival,
  'basis' | 'headwayRangeSeconds' | 'headwaySeconds'
> & {
  time: string;
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

function formatServiceDayTime(seconds: number) {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

/**
 * Returns the next two frequency-based arrival estimates for every service at
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
  const secondsSinceStartOfDay = Math.ceil(
    input.referenceNow.diff(input.referenceNow.startOf('day'), 'seconds')
      .seconds,
  );

  return input.services
    .flatMap((service) => {
      try {
        if (service.revision.estimatedFrequency == null) {
          return [];
        }
        const schedules = serviceDates.map((serviceDate, index) => ({
          serviceDate,
          schedule: scheduleForServiceDate({
            station: input.station,
            service,
            calendar: calendarForDate(serviceDate, input.publicHolidayDates),
          }),
          queriedAtTime: formatServiceDayTime(
            index === 0
              ? secondsSinceStartOfDay + 86_400
              : index === 1
                ? secondsSinceStartOfDay
                : 0,
          ),
        }));
        const scheduleEstimates = schedules.map(
          ({ serviceDate, schedule, queriedAtTime }) => {
            const startOfServiceDay = serviceDate.startOf('day');
            const estimates = estimateNextStationArrivals(
              schedule,
              queriedAtTime,
              2,
            ).map((estimate) => ({
              basis: estimate.basis,
              headwaySeconds: estimate.headwaySeconds,
              headwayRangeSeconds: estimate.headwayRangeSeconds,
              time: isoDateTime(
                startOfServiceDay.plus({ seconds: estimate.estimatedSeconds }),
              ),
            }));
            return { serviceDate, schedule, estimates };
          },
        );
        const currentSchedule = scheduleEstimates[1]?.schedule;
        const allDepartures = scheduleEstimates
          .flatMap(({ estimates }) => estimates)
          .sort((a, b) => a.time.localeCompare(b.time));
        const departures = allDepartures
          .filter((departure) => Date.parse(departure.time) >= referenceMillis)
          .slice(0, 2);
        const isServiceEnded = !scheduleEstimates.some(
          ({ serviceDate, schedule }) => {
            const firstWindow = schedule.windows[0];
            const lastWindow = schedule.windows.at(-1);
            if (firstWindow == null || lastWindow == null) {
              return false;
            }
            const startOfServiceDay = serviceDate.startOf('day');
            return (
              startOfServiceDay
                .plus({ seconds: firstWindow.startSeconds })
                .toMillis() <= referenceMillis &&
              referenceMillis <=
                startOfServiceDay
                  .plus({ seconds: lastWindow.endSeconds })
                  .toMillis()
            );
          },
        );
        const nextServiceStart = scheduleEstimates
          .flatMap(({ serviceDate, schedule }) => {
            const firstWindow = schedule.windows[0];
            return firstWindow == null
              ? []
              : [
                  isoDateTime(
                    serviceDate
                      .startOf('day')
                      .plus({ seconds: firstWindow.startSeconds }),
                  ),
                ];
          })
          .find((departure) => Date.parse(departure) > referenceMillis);

        return departures.length > 0
          ? [
              {
                serviceId: service.serviceId,
                lineId: service.lineId,
                serviceName: service.serviceName,
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
        Date.parse(a.departures[0]?.time ?? '') -
        Date.parse(b.departures[0]?.time ?? '');
      return nextDepartureDiff !== 0
        ? nextDepartureDiff
        : a.serviceId.localeCompare(b.serviceId);
    });
}
