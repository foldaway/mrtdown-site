import { ArrowLongRightIcon } from '@heroicons/react/16/solid';
import type { ReactNode } from 'react';
import { FormattedMessage, type IntlShape, useIntl } from 'react-intl';
import type { StationArrivalsV2 } from '~/util/stationArrivalsV2';
import { ArrivalServiceRow } from './ArrivalServiceRow';
import {
  ArrivalTimeValue,
  ArrivalTimingDisplay,
  NoArrivalTimes,
} from './ArrivalTimingDisplay';

type ScheduledResponse = Extract<StationArrivalsV2, { source: 'scheduled' }>;
type ScheduledDeparture =
  ScheduledResponse['timings'][number]['departures'][number];

type ScheduledArrivalStatusProps = {
  data: ScheduledResponse;
  hasDepartures: boolean;
  heading: ReactNode;
  reportButton?: ReactNode;
  lineColor: string;
  now: number | null;
};

export function ScheduledArrivalStatus({
  data,
  hasDepartures,
  heading,
  reportButton,
  lineColor,
  now,
}: ScheduledArrivalStatusProps) {
  if (!hasDepartures) {
    return (
      <ArrivalServiceRow
        heading={heading}
        lineColor={lineColor}
        platformLabels={[]}
      >
        <ArrivalTimingDisplay reportButton={reportButton}>
          <NoArrivalTimes emptyWindow={data.coverage.complete} />
        </ArrivalTimingDisplay>
      </ArrivalServiceRow>
    );
  }

  const firstTimedGroup = data.timings.find(
    ({ departures }) => departures.length > 0,
  );
  return (
    <div className="space-y-2">
      {data.timings.map((timing) => {
        const [next, following] = timing.departures;
        return (
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
              <ArrivalTimingDisplay
                reportButton={timing === firstTimedGroup ? reportButton : null}
              >
                {next ? (
                  <>
                    <DepartureTime departure={next} now={now} />
                    {following && (
                      <DepartureTime
                        departure={following}
                        following
                        now={now}
                      />
                    )}
                  </>
                ) : (
                  <NoArrivalTimes emptyWindow={data.coverage.complete} />
                )}
              </ArrivalTimingDisplay>
            </ArrivalServiceRow>
          </div>
        );
      })}
    </div>
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
  const duration = minutes > 0 ? formatWait(minutes, intl, following) : null;
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
    <span className="inline-flex items-center gap-1 text-[11px] text-gray-600 leading-snug sm:text-xs dark:text-gray-400">
      <FormattedMessage
        id="station.arrival_timings.then"
        defaultMessage="<label>then</label> {time}"
        values={{
          label: (label) => (
            <>
              <span className="sr-only">{label}</span>
              <ArrowLongRightIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-gray-500 dark:text-gray-400"
              />
            </>
          ),
          time: (
            <strong className="whitespace-nowrap font-medium">{value}</strong>
          ),
        }}
      />
    </span>
  ) : (
    <ArrivalTimeValue>{value}</ArrivalTimeValue>
  );
}

function formatWait(minutes: number, intl: IntlShape, following = false) {
  const unit = (text: ReactNode) =>
    following ? (
      text
    ) : (
      <span className="font-medium text-[0.7em] tracking-normal">{text}</span>
    );
  if (minutes > 60) {
    return intl.formatMessage(
      {
        id: 'station.arrival_timings.hours_and_minutes',
        defaultMessage:
          '{hours, number}<unit>h</unit> {minutes, number}<unit>m</unit>',
      },
      { hours: Math.floor(minutes / 60), minutes: minutes % 60, unit },
    );
  }
  return intl.formatMessage(
    {
      id: 'station.arrival_timings.compact_minutes',
      defaultMessage: '{minutes, number} <unit>min</unit>',
    },
    { minutes, unit },
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
