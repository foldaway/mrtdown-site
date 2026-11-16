import { ChevronDownIcon } from '@heroicons/react/16/solid';
import type { ReactNode } from 'react';
import { FormattedMessage, type IntlShape, useIntl } from 'react-intl';
import type { StationArrivalsV2 } from '~/util/stationArrivalsV2';
import { ArrivalServiceRow } from './ArrivalServiceRow';

type ScheduledResponse = Extract<StationArrivalsV2, { source: 'scheduled' }>;
type ScheduledDeparture =
  ScheduledResponse['timings'][number]['departures'][number];

type ScheduledArrivalStatusProps = {
  data: ScheduledResponse;
  hasDepartures: boolean;
  heading: ReactNode;
  lineColor: string;
  now: number | null;
};

export function ScheduledArrivalStatus({
  data,
  hasDepartures,
  heading,
  lineColor,
  now,
}: ScheduledArrivalStatusProps) {
  const intl = useIntl();
  if (!hasDepartures) {
    return (
      <ArrivalServiceRow
        heading={heading}
        lineColor={lineColor}
        platformLabels={[]}
      >
        <div
          aria-live="polite"
          className="text-gray-700 text-xs dark:text-gray-200"
        >
          {data.coverage.complete ? (
            <>
              <p className="font-medium">
                <FormattedMessage
                  id="station.arrivals.empty_window"
                  defaultMessage="No scheduled departures"
                />
              </p>
              <p className="mt-0.5">
                <FormattedMessage
                  id="station.arrivals.empty_window_range"
                  defaultMessage="{start}–{end} (Singapore time)"
                  values={{
                    start: formatClockTime(data.window.startInstant, intl),
                    end: formatClockTime(data.window.endInstant, intl),
                  }}
                />
              </p>
            </>
          ) : (
            <FormattedMessage
              id="station.arrivals.no_timed_departures"
              defaultMessage="Incomplete timetable. No departure times."
            />
          )}
        </div>
      </ArrivalServiceRow>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {data.timings.map((timing) => (
          <div
            className="border-gray-200 dark:border-gray-700 [&+&]:border-t [&+&]:pt-2"
            key={JSON.stringify(timing.platforms.map(({ id }) => id))}
          >
            <ArrivalServiceRow
              alternativePlatforms={timing.platforms.length > 1}
              heading={heading}
              lineColor={lineColor}
              platformLabels={[
                ...new Set(timing.platforms.map(({ label }) => label)),
              ]}
            >
              <PlatformDepartures departures={timing.departures} now={now} />
            </ArrivalServiceRow>
          </div>
        ))}
      </div>
      {!data.coverage.complete && (
        <p
          aria-live="polite"
          className="mt-1 text-gray-700 text-xs dark:text-gray-200"
        >
          <FormattedMessage
            id="station.arrivals.incomplete"
            defaultMessage="Incomplete timetable"
          />
        </p>
      )}
    </>
  );
}

type PlatformDeparturesProps = {
  departures: ScheduledDeparture[];
  now: number | null;
};

function PlatformDepartures({ departures, now }: PlatformDeparturesProps) {
  const intl = useIntl();
  const [next, following] = departures;
  if (!next) return null;

  return (
    <details className="group text-gray-700 dark:text-gray-200">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-end gap-1.5 rounded py-0.5 focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 space-y-0.5 tabular-nums">
          <DepartureTime departure={next} now={now} />
          {following && (
            <DepartureTime departure={following} following now={now} />
          )}
        </span>
        <span className="sr-only">
          <FormattedMessage
            id="station.arrivals.scheduled_times"
            defaultMessage="Scheduled times"
          />
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 group-open:rotate-180"
        />
      </summary>
      <ol className="mt-1 space-y-1 text-xs tabular-nums">
        {departures.map((departure) => (
          <li
            key={JSON.stringify([
              departure.manifestSha256,
              departure.snapshotSha256,
              departure.revisionId,
              departure.serviceDate,
              departure.providerTripId,
              departure.providerStopId,
              departure.stopSequence,
            ])}
          >
            <time className="font-medium" dateTime={departure.time}>
              {formatClockTime(departure.time, intl)}
            </time>{' '}
            <DeparturePrecision precision={departure.precision} />
          </li>
        ))}
      </ol>
    </details>
  );
}

type DepartureTimeProps = {
  departure: ScheduledDeparture;
  following?: boolean;
  now: number | null;
};

function DepartureTime({ departure, following, now }: DepartureTimeProps) {
  const intl = useIntl();
  const minutes =
    now == null ? 0 : Math.ceil((Date.parse(departure.time) - now) / 60_000);
  const duration = minutes > 0 ? formatWait(minutes, intl) : null;
  const clock = (
    <time dateTime={departure.time}>
      {formatClockTime(departure.time, intl)}
    </time>
  );

  const value = (
    <>
      {departure.precision !== 'exact' && (
        <>
          <span aria-hidden="true">≈</span>
          <span className="sr-only">
            <FormattedMessage
              id="station.arrivals.approximate_scheduled"
              defaultMessage="Approximate scheduled"
            />{' '}
          </span>
        </>
      )}
      {duration ?? clock}
    </>
  );

  return following ? (
    <span className="block text-gray-700 text-xs leading-snug dark:text-gray-200">
      <FormattedMessage
        id="station.arrival_timings.then"
        defaultMessage="then {time}"
        values={{ time: <strong className="font-semibold">{value}</strong> }}
      />
    </span>
  ) : (
    <span className="block font-bold text-gray-900 text-xl leading-none dark:text-gray-100">
      {value}
    </span>
  );
}

function formatWait(minutes: number, intl: IntlShape) {
  if (minutes >= 60) {
    return intl.formatMessage(
      {
        id: 'station.arrival_timings.hours_and_minutes',
        defaultMessage: '{hours, number}h {minutes, number}m',
      },
      { hours: Math.floor(minutes / 60), minutes: minutes % 60 },
    );
  }
  return intl.formatMessage(
    {
      id: 'station.arrival_timings.compact_minutes',
      defaultMessage: '{minutes, number} min',
    },
    { minutes },
  );
}

function formatClockTime(time: string, intl: IntlShape) {
  return intl.formatTime(time, { timeZone: 'Asia/Singapore' });
}

type DeparturePrecisionProps = { precision: ScheduledDeparture['precision'] };

function DeparturePrecision({ precision }: DeparturePrecisionProps) {
  return precision === 'exact' ? (
    <FormattedMessage
      id="station.arrivals.scheduled"
      defaultMessage="Scheduled"
    />
  ) : (
    <FormattedMessage
      id="station.arrivals.approximate_scheduled"
      defaultMessage="Approximate scheduled"
    />
  );
}
