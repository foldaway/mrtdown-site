import { FormattedMessage, type IntlShape, useIntl } from 'react-intl';
import type { StationArrivalsV2 } from '~/util/stationArrivalsV2';
import { PlatformSign } from './StationGuideSigns';

type ScheduledResponse = Extract<StationArrivalsV2, { source: 'scheduled' }>;
type ScheduledDeparture =
  ScheduledResponse['timings'][number]['departures'][number];

type ScheduledArrivalStatusProps = {
  data: ScheduledResponse;
  hasDepartures: boolean;
  lineColor: string;
  now: number | null;
};

export function ScheduledArrivalStatus({
  data,
  hasDepartures,
  lineColor,
  now,
}: ScheduledArrivalStatusProps) {
  const intl = useIntl();
  return (
    <div className="min-w-0 space-y-2 text-gray-700 text-xs dark:text-gray-300">
      {!hasDepartures ? (
        <div aria-live="polite">
          {data.coverage.complete ? (
            <>
              <p className="text-sm">
                <FormattedMessage
                  id="station.arrivals.empty_window"
                  defaultMessage="No scheduled departures"
                />
              </p>
              <p className="text-gray-500 dark:text-gray-400">
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
            <p className="text-sm">
              <FormattedMessage
                id="station.arrivals.no_timed_departures"
                defaultMessage="Incomplete timetable. No departure times."
              />
            </p>
          )}
        </div>
      ) : (
        !data.coverage.complete && (
          <p aria-live="polite">
            <FormattedMessage
              id="station.arrivals.incomplete"
              defaultMessage="Incomplete timetable"
            />
          </p>
        )
      )}
      {data.timings.map((timing) => (
        <div
          className="space-y-1.5 border-gray-200 dark:border-gray-700 [&+&]:border-t [&+&]:pt-2"
          key={JSON.stringify(timing.platforms.map(({ id }) => id))}
        >
          {timing.platforms.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {timing.platforms.map((platform) => (
                <PlatformSign
                  key={platform.id}
                  color={lineColor}
                  label={platform.label}
                />
              ))}
              {timing.platforms.length > 1 && (
                <span>
                  <FormattedMessage
                    id="station.arrivals.platform_alternatives"
                    defaultMessage="Alternative platforms for the same train"
                  />
                </span>
              )}
            </div>
          )}
          <PlatformDepartures departures={timing.departures} now={now} />
        </div>
      ))}
    </div>
  );
}

type PlatformDeparturesProps = {
  departures: ScheduledDeparture[];
  now: number | null;
};

function PlatformDepartures({ departures, now }: PlatformDeparturesProps) {
  const intl = useIntl();
  const [next, following, ...later] = departures;
  if (!next) return null;

  return (
    <>
      <ol className="grid grid-cols-2 items-baseline gap-x-3 tabular-nums">
        <li className="min-w-0">
          <DepartureTime departure={next} now={now} />
        </li>
        {following && (
          <li className="min-w-0">
            <DepartureTime departure={following} following now={now} />
          </li>
        )}
      </ol>
      {later.length > 0 && (
        <details>
          <summary className="w-fit cursor-pointer rounded py-1 text-gray-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-300">
            <FormattedMessage
              id="station.arrivals.later_departures"
              defaultMessage="Later departures"
            />
          </summary>
          <ol className="mt-1 space-y-1 ps-3 tabular-nums">
            {later.map((departure) => (
              <li
                className="flex flex-wrap items-baseline gap-x-2"
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
                </time>
                <DeparturePrecision precision={departure.precision} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
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
    <time dateTime={departure.time} className="whitespace-nowrap">
      {formatClockTime(departure.time, intl)}
    </time>
  );

  return (
    <>
      <p
        className={
          following
            ? 'font-medium text-gray-700 text-sm leading-tight dark:text-gray-200'
            : 'font-bold text-gray-900 text-lg leading-none dark:text-gray-100'
        }
      >
        {following ? (
          <FormattedMessage
            id="station.arrival_timings.then"
            defaultMessage="then {time}"
            values={{ time: duration ?? clock }}
          />
        ) : (
          (duration ?? clock)
        )}
      </p>
      <p className="mt-0.5 text-gray-500 dark:text-gray-400">
        {duration != null && <span className="block">{clock}</span>}
        <DeparturePrecision precision={departure.precision} />
      </p>
    </>
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
