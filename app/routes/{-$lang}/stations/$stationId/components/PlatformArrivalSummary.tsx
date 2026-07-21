import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { Link } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { FormattedMessage, type IntlShape, useIntl } from 'react-intl';
import { Tooltip } from 'radix-ui';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { PlatformSign } from './StationGuideSigns';
import type { ArrivalTiming } from './stationGuide.types';

export function ServiceArrivalSummary({
  arrivalTiming,
  isHydrated,
  lineColor,
}: {
  arrivalTiming: ArrivalTiming;
  isHydrated: boolean;
  lineColor: string;
}) {
  const intl = useIntl();
  const now = useCurrentTime(isHydrated);
  const destinationName =
    arrivalTiming.destinationName == null
      ? null
      : getLocalizedTranslation(arrivalTiming.destinationName, intl.locale);

  return (
    <li className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-gray-500 text-sm dark:text-gray-400">
            <FormattedMessage
              id="station.arrival_timings.towards_label"
              defaultMessage="Towards"
            />
          </span>
          {arrivalTiming.destinationStationId == null ? (
            <DestinationIdentity
              code={arrivalTiming.destinationCode}
              color={lineColor}
              name={destinationName}
            />
          ) : (
            <Link
              className="group flex min-w-0 items-center gap-1.5"
              params={{ stationId: arrivalTiming.destinationStationId }}
              to="/{-$lang}/stations/$stationId"
            >
              <DestinationIdentity
                code={arrivalTiming.destinationCode}
                color={lineColor}
                name={destinationName}
              />
            </Link>
          )}
          <ServiceDetailsTooltip
            firstTrainTime={arrivalTiming.firstTrainTime}
            lastTrainTime={arrivalTiming.lastTrainTime}
            serviceName={arrivalTiming.serviceName}
          />
        </div>
        {arrivalTiming.platformLabels.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {arrivalTiming.platformLabels.map((label) => (
              <li key={label}>
                <PlatformBadge color={lineColor} label={label} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <ArrivalStatus arrivalTiming={arrivalTiming} intl={intl} now={now} />
    </li>
  );
}

function useCurrentTime(isHydrated: boolean) {
  const [now, setNow] = useState<DateTime | null>(null);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    const updateNow = () => setNow(DateTime.now().setZone('Asia/Singapore'));
    updateNow();
    const interval = window.setInterval(updateNow, 30_000);
    return () => window.clearInterval(interval);
  }, [isHydrated]);

  return now;
}

function StationPill({ color, code }: { color: string; code: string }) {
  return (
    <span
      className="shrink-0 rounded-md px-1.5 py-0.5 font-bold text-[11px] text-white leading-none shadow-sm"
      style={{ backgroundColor: color }}
    >
      {code}
    </span>
  );
}

function DestinationIdentity({
  code,
  color,
  name,
}: {
  code: string;
  color: string;
  name: string | null;
}) {
  return (
    <>
      <StationPill color={color} code={code} />
      {name != null && (
        <span className="truncate font-medium text-gray-800 text-sm group-hover:underline dark:text-gray-200">
          {name}
        </span>
      )}
    </>
  );
}

function PlatformBadge({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex" title={`Platform ${label}`}>
      <PlatformSign color={color} label={label} />
      <span className="sr-only">
        <FormattedMessage
          id="station.arrival_timings.platform"
          defaultMessage="Platform {label}"
          values={{ label }}
        />
      </span>
    </span>
  );
}

function ArrivalStatus({
  arrivalTiming,
  intl,
  now,
}: {
  arrivalTiming: ArrivalTiming;
  intl: IntlShape;
  now: DateTime | null;
}) {
  if (arrivalTiming.isServiceEnded) {
    const firstTrain = arrivalTiming.nextServiceStart;
    return (
      <div className="shrink-0 rounded-md bg-gray-50 px-3 py-2 text-left sm:min-w-44 dark:bg-gray-900/30">
        <p className="font-semibold text-gray-800 text-sm dark:text-gray-200">
          <FormattedMessage
            id="station.arrival_timings.service_ended"
            defaultMessage="Service ended"
          />
        </p>
        {firstTrain != null && (
          <p className="mt-0.5 text-gray-600 text-xs tabular-nums dark:text-gray-300">
            <FormattedMessage
              id="station.arrival_timings.first_train"
              defaultMessage="First train {time}"
              values={{ time: formatTime(firstTrain, intl) }}
            />
          </p>
        )}
      </div>
    );
  }

  const [nextDeparture, followingDeparture] = arrivalTiming.departures;
  if (nextDeparture == null) {
    return (
      <span className="shrink-0 rounded-md border border-gray-300 border-dashed px-2 py-1 font-semibold text-gray-500 text-xs dark:border-gray-600 dark:text-gray-400">
        <FormattedMessage
          id="station.arrival_timings.unavailable"
          defaultMessage="N/A"
        />
      </span>
    );
  }

  return (
    <div className="grid shrink-0 grid-cols-[auto_auto] gap-x-4 text-left tabular-nums sm:min-w-44">
      <p className="font-bold text-gray-900 text-sm leading-tight dark:text-gray-100">
        <ArrivalTimingValue departure={nextDeparture} intl={intl} now={now} />
      </p>
      {followingDeparture != null && (
        <p className="font-medium text-gray-700 text-sm leading-tight dark:text-gray-200">
          <FormattedMessage
            id="station.arrival_timings.then"
            defaultMessage="then {time}"
            values={{ time: formatRelativeTime(followingDeparture, intl, now) }}
          />
        </p>
      )}
      <p className="text-gray-500 text-xs leading-tight dark:text-gray-400">
        {formatTime(nextDeparture, intl)}
      </p>
      {followingDeparture != null && (
        <p className="text-gray-500 text-xs leading-tight dark:text-gray-400">
          {formatTime(followingDeparture, intl)}
        </p>
      )}
    </div>
  );
}

function ServiceDetailsTooltip({
  firstTrainTime,
  lastTrainTime,
  serviceName,
}: {
  firstTrainTime: string | null;
  lastTrainTime: string | null;
  serviceName: ArrivalTiming['serviceName'];
}) {
  const intl = useIntl();
  const label = intl.formatMessage({
    id: 'station.arrival_timings.service_details_label',
    defaultMessage: 'Service details',
  });
  const localizedServiceName = getLocalizedTranslation(
    serviceName,
    intl.locale,
  );

  return (
    <Tooltip.Provider delayDuration={100}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            aria-label={label}
            className="-m-1 shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 dark:hover:text-gray-200"
            type="button"
          >
            <InformationCircleIcon aria-hidden={true} className="size-4" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 rounded-md bg-gray-900 px-3 py-2 text-white text-xs shadow-lg dark:bg-gray-700"
            sideOffset={4}
          >
            <p className="font-semibold">{label}</p>
            <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-gray-200 dark:text-gray-300">
              <dt className="text-gray-400 dark:text-gray-400">
                <FormattedMessage
                  id="station.arrival_timings.service_label"
                  defaultMessage="Service"
                />
              </dt>
              <dd className="min-w-0">{localizedServiceName}</dd>
              {firstTrainTime != null && lastTrainTime != null && (
                <>
                  <dt className="text-gray-400 dark:text-gray-400">
                    <FormattedMessage
                      id="station.arrival_timings.service_hours_label"
                      defaultMessage="Service hours"
                    />
                  </dt>
                  <dd className="tabular-nums">
                    <FormattedMessage
                      id="station.arrival_timings.service_hours"
                      defaultMessage="First {firstTrain} · Last {lastTrain} (Singapore time)"
                      values={{
                        firstTrain: formatServiceTime(firstTrainTime, intl),
                        lastTrain: formatServiceTime(lastTrainTime, intl),
                      }}
                    />
                  </dd>
                </>
              )}
            </dl>
            <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function formatServiceTime(time: string, intl: IntlShape) {
  const dateTime = DateTime.fromFormat(
    time,
    time.length === 5 ? 'HH:mm' : 'HH:mm:ss',
    {
      zone: 'Asia/Singapore',
    },
  );
  return dateTime.isValid
    ? intl.formatTime(dateTime.toJSDate(), {
        hour: 'numeric',
        hour12: true,
        minute: '2-digit',
        timeZone: 'Asia/Singapore',
      })
    : time;
}

function ArrivalTimingValue({
  departure,
  intl,
  now,
}: {
  departure: string;
  intl: IntlShape;
  now: DateTime | null;
}) {
  const departureTime = DateTime.fromISO(departure, { setZone: true });
  if (now == null || !departureTime.isValid) {
    return formatTime(departure, intl);
  }

  return formatRelativeTime(departure, intl, now);
}

function formatRelativeTime(
  departure: string,
  intl: IntlShape,
  now: DateTime | null,
) {
  const departureTime = DateTime.fromISO(departure, { setZone: true });
  if (now == null || !departureTime.isValid) {
    return formatTime(departure, intl);
  }
  const minutes = Math.max(0, Math.ceil(departureTime.diff(now).as('minutes')));
  return minutes === 0
    ? intl.formatMessage({
        id: 'station.arrival_timings.now',
        defaultMessage: 'Now',
      })
    : minutes >= 60
      ? intl.formatMessage(
          {
            id: 'station.arrival_timings.hours_and_minutes',
            defaultMessage: '{hours, number}h {minutes, number}m',
          },
          {
            hours: Math.floor(minutes / 60),
            minutes: minutes % 60,
          },
        )
      : intl.formatMessage(
          {
            id: 'station.arrival_timings.compact_minutes',
            defaultMessage: '{minutes, number} min',
          },
          { minutes },
        );
}

function formatTime(departure: string, intl: IntlShape) {
  const departureTime = DateTime.fromISO(departure, { setZone: true });
  return departureTime.isValid
    ? intl.formatTime(departureTime.toJSDate(), {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Singapore',
      })
    : departure;
}
