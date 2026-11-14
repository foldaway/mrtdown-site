import { Link } from '@tanstack/react-router';
import { FormattedMessage, useIntl } from 'react-intl';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { CrowdArrivalReport, RecentCrowdArrival } from './CrowdArrivalReport';
import {
  ArrivalRefreshNotice,
  ScheduledArrivalStatus,
} from './ScheduledArrivalStatus';
import { ServiceDetailsPopover } from './ServiceDetailsPopover';
import { PlatformSign } from './StationGuideSigns';
import type { BranchArrivalState } from './stationArrivalRefresh';
import type { ArrivalTiming } from './stationGuide.types';

type ServiceArrivalSummaryProps = {
  arrivalTiming: ArrivalTiming;
  arrivalState?: BranchArrivalState;
  lineColor: string;
  now: number | null;
  onArrivalReported?: () => Promise<void>;
};

export function ServiceArrivalSummary({
  arrivalTiming,
  arrivalState,
  lineColor,
  now,
  onArrivalReported,
}: ServiceArrivalSummaryProps) {
  const intl = useIntl();
  const data = arrivalState?.data;
  const report = data?.recentCrowdArrival;
  const recentReport =
    report && now != null && now < Date.parse(report.expiresAt) ? report : null;
  const reportable =
    data &&
    (data.scope.stationId !== data.scope.destinationStationId ||
      (data.source === 'scheduled' &&
        data.timings.some(({ departures }) => departures.length > 0)));
  const destinationName =
    arrivalTiming.destinationName == null
      ? null
      : getLocalizedTranslation(arrivalTiming.destinationName, intl.locale);
  const identity = (
    <>
      <span
        className="shrink-0 rounded-md px-1.5 py-0.5 font-bold text-[11px] text-white leading-none shadow-sm"
        style={{ backgroundColor: lineColor }}
      >
        {arrivalTiming.destinationCode}
      </span>
      {destinationName != null && (
        <span className="truncate font-medium text-gray-800 text-sm group-hover:underline dark:text-gray-200">
          {destinationName}
        </span>
      )}
    </>
  );
  return (
    <li className="px-4 py-2.5 sm:px-6">
      <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-gray-500 text-sm dark:text-gray-400">
              <FormattedMessage
                id="station.arrival_timings.towards_label"
                defaultMessage="Towards"
              />
            </span>
            {arrivalTiming.destinationStationId == null ? (
              identity
            ) : (
              <Link
                className="group flex min-w-0 items-center gap-1.5"
                params={{ stationId: arrivalTiming.destinationStationId }}
                to="/{-$lang}/stations/$stationId"
              >
                {identity}
              </Link>
            )}
            <ServiceDetailsPopover serviceName={arrivalTiming.serviceName} />
          </div>
          {data?.source !== 'scheduled' &&
            arrivalTiming.platformLabels.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {arrivalTiming.platformLabels.map((label) => (
                  <li key={label} className="inline-flex">
                    <PlatformSign color={lineColor} label={label} />
                    <span className="sr-only">
                      <FormattedMessage
                        id="station.arrival_timings.platform"
                        defaultMessage="Platform {label}"
                        values={{ label }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </div>
        {data?.source === 'scheduled' ? (
          <ScheduledArrivalStatus
            data={data}
            lineColor={lineColor}
            now={arrivalState?.status === 'error' ? null : now}
          />
        ) : data?.source === 'unavailable' ||
          arrivalState?.status === 'error' ||
          arrivalTiming.destinationStationId == null ? (
          <p className="text-gray-600 text-sm dark:text-gray-300">
            {recentReport ? (
              <FormattedMessage
                id="station.arrivals.timetable_unavailable"
                defaultMessage="Timetable unavailable. Please check station displays."
              />
            ) : (
              <FormattedMessage
                id="station.arrivals.unavailable"
                defaultMessage="Arrivals unavailable. Please check station displays."
              />
            )}
          </p>
        ) : null}
      </div>
      <ArrivalRefreshNotice
        state={arrivalState}
        hasScope={arrivalTiming.destinationStationId != null}
      />
      {recentReport && <RecentCrowdArrival report={recentReport} />}
      {reportable && onArrivalReported && (
        <CrowdArrivalReport
          key={JSON.stringify(data.scope)}
          scope={{
            stationId: data.scope.stationId,
            lineId: data.scope.lineId,
            serviceId: data.scope.serviceId,
            destinationStationId: data.scope.destinationStationId,
          }}
          onSubmitted={onArrivalReported}
        />
      )}
    </li>
  );
}
