import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { type ComponentProps, type ReactNode, useId, useState } from 'react';
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
  firstHeading: ReactNode;
  lineColor: string;
  now: number | null;
};

export function ScheduledArrivalStatus({
  data,
  hasDepartures,
  heading,
  firstHeading,
  lineColor,
  now,
}: ScheduledArrivalStatusProps) {
  const intl = useIntl();
  if (!hasDepartures) {
    return (
      <ArrivalServiceRow
        heading={firstHeading}
        lineColor={lineColor}
        platformLabels={[]}
        status={
          data.coverage.complete ? (
            <details className="group/empty">
              <summary className="flex min-h-7 w-fit cursor-pointer list-none items-center gap-1 rounded hover:text-gray-800 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:text-gray-200 [&::-webkit-details-marker]:hidden">
                <FormattedMessage
                  id="station.arrivals.empty_window"
                  defaultMessage="No departures in this window"
                />
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 group-open/empty:rotate-180"
                />
              </summary>
              <p className="pb-1">
                <FormattedMessage
                  id="station.arrivals.empty_window_range"
                  defaultMessage="{start}–{end} (Singapore time)"
                  values={{
                    start: formatClockTime(data.window.startInstant, intl),
                    end: formatClockTime(data.window.endInstant, intl),
                  }}
                />
              </p>
            </details>
          ) : (
            <FormattedMessage
              id="station.arrivals.timetable_unavailable"
              defaultMessage="Timetable unavailable"
            />
          )
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {data.timings.map((timing, index) => (
        <div
          className="border-gray-200 dark:border-gray-700 [&+&]:border-t [&+&]:pt-2"
          key={JSON.stringify(timing.platforms.map(({ id }) => id))}
        >
          <PlatformDepartures
            departures={timing.departures}
            now={now}
            alternativePlatforms={timing.platforms.length > 1}
            heading={index === 0 ? firstHeading : heading}
            lineColor={lineColor}
            platformLabels={[
              ...new Set(timing.platforms.map(({ label }) => label)),
            ]}
          />
        </div>
      ))}
    </div>
  );
}

type PlatformDeparturesProps = Omit<
  ComponentProps<typeof ArrivalServiceRow>,
  'children' | 'status'
> & {
  departures: ScheduledDeparture[];
  now: number | null;
};

function PlatformDepartures({
  departures,
  now,
  ...row
}: PlatformDeparturesProps) {
  const intl = useIntl();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [next, following] = departures;
  if (!next) return <ArrivalServiceRow {...row} />;

  return (
    <>
      <ArrivalServiceRow {...row}>
        <button
          aria-controls={panelId}
          aria-expanded={expanded}
          className="group flex min-h-11 cursor-pointer items-center justify-end gap-0.5 rounded-md px-0.5 text-end hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 sm:gap-2 sm:px-1 dark:hover:bg-white/5"
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
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
            className="size-4.5 shrink-0 text-gray-500 group-aria-expanded:rotate-180 sm:size-5 dark:text-gray-400"
            strokeWidth={2}
          />
        </button>
      </ArrivalServiceRow>
      <section
        aria-labelledby={`${panelId}-title`}
        className="mt-2 rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-900/50"
        hidden={!expanded}
        id={panelId}
      >
        <h4
          className="mb-1.5 font-medium text-gray-600 text-xs dark:text-gray-300"
          id={`${panelId}-title`}
        >
          <FormattedMessage
            id="station.arrivals.scheduled_times"
            defaultMessage="Scheduled times"
          />
        </h4>
        <ol className="grid grid-cols-2 gap-x-2 gap-y-1 text-gray-900 text-sm tabular-nums sm:grid-cols-3 lg:grid-cols-4 dark:text-gray-100">
          {departures.map((departure) => (
            <li
              className="min-w-0"
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
              {departure.precision !== 'exact' && <ApproximateTime />}
              <time dateTime={departure.time}>
                {formatClockTime(departure.time, intl)}
              </time>
            </li>
          ))}
        </ol>
      </section>
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
    <time dateTime={departure.time}>
      {formatClockTime(departure.time, intl)}
    </time>
  );

  const value = (
    <>
      {departure.precision !== 'exact' && <ApproximateTime />}
      {duration ?? clock}
    </>
  );

  return following ? (
    <span className="block text-gray-600 text-xs leading-snug dark:text-gray-400">
      <FormattedMessage
        id="station.arrival_timings.then"
        defaultMessage="then {time}"
        values={{
          time: (
            <strong className="whitespace-nowrap font-medium">{value}</strong>
          ),
        }}
      />
    </span>
  ) : (
    <span className="block font-semibold text-gray-950 text-lg leading-none tracking-tight sm:text-xl dark:text-white">
      {value}
    </span>
  );
}

function formatWait(minutes: number, intl: IntlShape) {
  if (minutes > 60) {
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

function ApproximateTime() {
  return (
    <>
      <span aria-hidden="true">≈</span>
      <span className="sr-only">
        <FormattedMessage
          id="station.arrivals.approximate_scheduled"
          defaultMessage="Approximate scheduled"
        />{' '}
      </span>
    </>
  );
}
