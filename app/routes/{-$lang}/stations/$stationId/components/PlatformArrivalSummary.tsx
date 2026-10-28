import { Link } from '@tanstack/react-router';
import { FormattedMessage, useIntl } from 'react-intl';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { PlatformSign } from './StationGuideSigns';
import type { ArrivalTiming } from './stationGuide.types';
import type { BranchArrivalState } from './stationArrivalRefresh';
import {
  ArrivalRefreshNotice,
  ScheduledArrivalStatus,
} from './ScheduledArrivalStatus';

type ServiceArrivalSummaryProps = {
  arrivalTiming: ArrivalTiming;
  arrivalState?: BranchArrivalState;
  lineColor: string;
};

export function ServiceArrivalSummary({
  arrivalTiming,
  arrivalState,
  lineColor,
}: ServiceArrivalSummaryProps) {
  const intl = useIntl();
  const data = arrivalState?.data;
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
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
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
          <ScheduledArrivalStatus data={data} lineColor={lineColor} />
        ) : data?.source === 'unavailable' ||
          arrivalState?.status === 'error' ||
          arrivalTiming.destinationStationId == null ? (
          <p className="text-gray-600 text-sm dark:text-gray-300">
            <FormattedMessage
              id="station.arrivals.unavailable"
              defaultMessage="Arrivals unavailable. Please check station displays."
            />
          </p>
        ) : null}
      </div>
      <ArrivalRefreshNotice
        state={arrivalState}
        hasScope={arrivalTiming.destinationStationId != null}
      />
    </li>
  );
}
