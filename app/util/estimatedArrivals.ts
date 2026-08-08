import {
  estimateNextStationArrivals,
  type CrowdArrivalReport,
  type EstimatedStationArrival,
  type EstimatedStationFrequencySchedule,
  generateEstimatedStationFrequencySchedule,
  type EstimatedStationScheduleCalendar,
  type ServiceRevision,
  type Station,
} from '@mrtdown/core';
import type { DateTime } from 'luxon';
import {
  isoDate,
  isoDateTime,
  parseDateTimeUncached,
} from './dbQueries/dateTime';

// Keep a just-submitted “arriving now” report pinned to the current arrival
// through a normal page refresh. After that, it becomes a phase anchor like
// every other report and is projected through the remaining service day.
const ARRIVING_NOW_CLAMP_WINDOW_MILLIS = 30_000;
export const MAX_CROWD_ARRIVAL_REPORT_AGE_MINUTES = 24 * 60;

export type EstimatedArrivalService = {
  serviceId: string;
  lineId: string;
  serviceName: Station['name'];
  destinationStationId: string | null;
  destinationCode: string;
  destinationName: Station['name'] | null;
  revision: Pick<ServiceRevision, 'path' | 'estimatedFrequency'>;
};

export type StoredCrowdArrivalReport = {
  id: string;
  serviceId: string;
  reportedAt: string;
  minutesToArrival: number;
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
  'basis' | 'confidence' | 'headwayRangeSeconds' | 'headwaySeconds'
> & {
  crowdReportCount: number;
  crowdReportsDisagree: boolean;
  time: string;
};

export function filterCurrentCrowdArrivalReports(
  reports: readonly StoredCrowdArrivalReport[],
  referenceNow: DateTime,
) {
  const referenceMillis = referenceNow.toMillis();
  return reports.filter((report) => {
    const reportAgeMillis =
      referenceMillis -
      parseDateTimeUncached(report.reportedAt)
        .setZone(referenceNow.zone)
        .toMillis();
    return (
      reportAgeMillis >= 0 &&
      reportAgeMillis <= MAX_CROWD_ARRIVAL_REPORT_AGE_MINUTES * 60_000
    );
  });
}

function projectCrowdReportToQuery(input: {
  report: Omit<StoredCrowdArrivalReport, 'reportedAt'> & {
    reportedAt: DateTime;
  };
  schedule: EstimatedStationFrequencySchedule;
  serviceDate: DateTime;
  queriedAtSeconds: number;
  referenceMillis: number;
}): CrowdArrivalReport | null {
  const reportAgeMillis =
    input.referenceMillis - input.report.reportedAt.toMillis();
  if (
    input.report.minutesToArrival === 0 &&
    reportAgeMillis <= ARRIVING_NOW_CLAMP_WINDOW_MILLIS
  ) {
    return {
      id: input.report.id,
      reportedAtTime: formatServiceDayTime(input.queriedAtSeconds),
      minutesToArrival: 0,
    };
  }

  let projectedSeconds = Math.round(
    input.report.reportedAt.diff(input.serviceDate, 'seconds').seconds +
      input.report.minutesToArrival * 60,
  );
  const firstWindow = input.schedule.windows[0];
  const lastWindow = input.schedule.windows.at(-1);
  if (
    firstWindow == null ||
    lastWindow == null ||
    projectedSeconds < firstWindow.startSeconds ||
    projectedSeconds >= lastWindow.endSeconds
  ) {
    return null;
  }

  while (projectedSeconds < input.queriedAtSeconds) {
    const window = input.schedule.windows.find(
      (candidate) =>
        candidate.startSeconds <= projectedSeconds &&
        projectedSeconds < candidate.endSeconds,
    );
    if (window == null) return null;
    projectedSeconds += window.headwaySeconds;
    if (projectedSeconds >= lastWindow.endSeconds) return null;
  }

  return {
    id: input.report.id,
    reportedAtTime: formatServiceDayTime(input.queriedAtSeconds),
    minutesToArrival: (projectedSeconds - input.queriedAtSeconds) / 60,
  };
}

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
  crowdReports?: readonly StoredCrowdArrivalReport[];
}): EstimatedArrivalTiming[] {
  const serviceDates = [-1, 0, 1].map((offset) =>
    input.referenceNow.startOf('day').plus({ days: offset }),
  );
  const referenceMillis = input.referenceNow.toMillis();
  const secondsSinceStartOfDay = Math.ceil(
    input.referenceNow.diff(input.referenceNow.startOf('day'), 'seconds')
      .seconds,
  );
  const crowdReports = input.crowdReports
    ? filterCurrentCrowdArrivalReports(
        input.crowdReports,
        input.referenceNow,
      ).map((report) => ({
        ...report,
        reportedAt: parseDateTimeUncached(report.reportedAt).setZone(
          input.referenceNow.zone,
        ),
      }))
    : undefined;

  return input.services
    .flatMap((service) => {
      try {
        if (service.revision.estimatedFrequency == null) {
          return [];
        }
        const schedules = serviceDates.map((serviceDate, index) => {
          const queriedAtSeconds =
            index === 0
              ? secondsSinceStartOfDay + 86_400
              : index === 1
                ? secondsSinceStartOfDay
                : 0;
          return {
            serviceDate,
            schedule: scheduleForServiceDate({
              station: input.station,
              service,
              calendar: calendarForDate(serviceDate, input.publicHolidayDates),
            }),
            queriedAtSeconds,
            queriedAtTime: formatServiceDayTime(queriedAtSeconds),
          };
        });
        const scheduleEstimates = schedules.map(
          ({ serviceDate, schedule, queriedAtSeconds, queriedAtTime }) => {
            const startOfServiceDay = serviceDate.startOf('day');
            const estimates = estimateNextStationArrivals(
              schedule,
              queriedAtTime,
              {
                count: 2,
                crowdReports: crowdReports
                  ?.filter((report) => report.serviceId === service.serviceId)
                  .map((report) =>
                    projectCrowdReportToQuery({
                      report,
                      schedule,
                      serviceDate: serviceDate.startOf('day'),
                      queriedAtSeconds,
                      referenceMillis,
                    }),
                  )
                  .filter(
                    (report): report is CrowdArrivalReport => report != null,
                  ),
              },
            ).map((estimate) => ({
              basis: estimate.basis,
              confidence: estimate.confidence,
              crowdReportCount: estimate.crowdReportIds?.length ?? 0,
              crowdReportsDisagree: estimate.crowdReportsDisagree ?? false,
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
