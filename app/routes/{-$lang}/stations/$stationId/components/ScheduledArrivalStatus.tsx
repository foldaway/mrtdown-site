import type { ReactNode } from 'react';
import { FormattedMessage, type IntlShape, useIntl } from 'react-intl';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { StationArrivalsV2 } from '~/util/stationArrivalsV2';
import { ArrivalServiceRow } from './ArrivalServiceRow';
import {
  ArrivalTimeValue,
  ArrivalTimingDisplay,
  NoArrivalTimes,
} from './ArrivalTimingDisplay';
import type { ArrivalTiming } from './stationGuide.types';

type ScheduledResponse = Extract<StationArrivalsV2, { source: 'scheduled' }>;
type ScheduledDeparture =
  ScheduledResponse['timings'][number]['departures'][number];

type ScheduledArrivalStatusProps = {
  data: ScheduledResponse;
  heading: ReactNode;
  reportButton?: ReactNode;
  lineColor: string;
  now: number | null;
  departureServices?: ReadonlyMap<ScheduledDeparture, ArrivalTiming[]>;
};

export function ScheduledArrivalStatus({
  data,
  heading,
  reportButton,
  lineColor,
  now,
  departureServices,
}: ScheduledArrivalStatusProps) {
  // A fresh response can be newer than the last sampled client clock.
  const emptyWindow =
    data.coverage.complete &&
    now != null &&
    Math.max(now, Date.parse(data.window.startInstant)) <
      Date.parse(data.window.endInstant);
  const timings = data.timings.map((timing) => ({
    ...timing,
    // Advance to the next scheduled train between refreshes rather than
    // turning an elapsed countdown into a large clock time.
    departures: timing.departures.filter(
      ({ time }) => now == null || Date.parse(time) > now,
    ),
  }));
  const hasDepartures = timings.some(({ departures }) => departures.length > 0);

  if (!hasDepartures) {
    return (
      <ArrivalServiceRow
        heading={heading}
        lineColor={lineColor}
        platformLabels={[]}
      >
        <ArrivalTimingDisplay reportButton={reportButton}>
          <NoArrivalTimes
            elapsed={data.timings.some(
              ({ departures }) => departures.length > 0,
            )}
            emptyWindow={emptyWindow}
          />
        </ArrivalTimingDisplay>
      </ArrivalServiceRow>
    );
  }

  const firstTimedGroup = timings.find(
    ({ departures }) => departures.length > 0,
  );
  return (
    <div className="space-y-1">
      {timings.map((timing, index) => {
        const departures = timing.departures.slice(0, 3);
        return (
          <div
            className="border-gray-200 dark:border-gray-700 [&+&]:border-t [&+&]:pt-1"
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
                {departures.length > 0 ? (
                  <div className="flex flex-1 flex-col">
                    {now == null && (
                      <p className="pt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        <FormattedMessage
                          id="station.arrivals.scheduled_label"
                          defaultMessage="Scheduled"
                        />
                      </p>
                    )}
                    <div
                      className="-mx-2 grid min-h-8 flex-1 items-stretch"
                      style={{
                        gridTemplateColumns: `${'2.25rem '.repeat(departures.length - 1)}minmax(0, 1fr)`,
                      }}
                    >
                      {departures.map((departure, index) => (
                        <DepartureTime
                          departure={departure}
                          following={index > 0}
                          key={JSON.stringify(departure)}
                          now={now}
                          showUnit={index === departures.length - 1}
                          services={departureServices?.get(departure)}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <NoArrivalTimes
                    elapsed={data.timings[index].departures.length > 0}
                    emptyWindow={emptyWindow}
                  />
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
  showUnit: boolean;
  services?: ArrivalTiming[];
};

function DepartureTime({
  departure,
  following,
  now,
  showUnit,
  services,
}: DepartureTimeProps) {
  const intl = useIntl();
  const serviceNames = services?.map(({ serviceName }) =>
    getLocalizedTranslation(serviceName, intl.locale),
  );
  const serviceLabels = services?.map(({ serviceId }, index) => {
    if (serviceId === 'BPLRT_A') return 'A';
    if (serviceId === 'BPLRT_B') return 'B';
    return serviceNames?.[index];
  });
  const duration =
    now == null
      ? null
      : formatWait(
          Math.ceil((Date.parse(departure.time) - now) / 60_000),
          intl,
          showUnit,
        );
  const clock = (
    <time dateTime={departure.time}>
      {formatClockTime(departure.time, intl)}
    </time>
  );

  const timeValue = (
    <ArrivalTimeValue clock={now == null} secondary={following}>
      {departure.precision !== 'exact' && <ApproximateTime />}
      {duration ?? clock}
    </ArrivalTimeValue>
  );
  const value = services ? (
    <span className="flex min-w-0 flex-col items-center">
      {timeValue}
      <span
        className="text-[9px] text-gray-500 leading-tight dark:text-gray-400"
        title={intl.formatList(serviceNames ?? [], { type: 'conjunction' })}
      >
        <span aria-hidden="true">{serviceLabels?.join(' / ')}</span>
        <span className="sr-only">
          {intl.formatList(serviceNames ?? [], { type: 'conjunction' })}
        </span>
      </span>
    </span>
  ) : (
    timeValue
  );

  return following ? (
    <span
      className={`inline-flex min-w-0 items-center border-gray-200/80 border-s py-1.5 dark:border-white/10 ${showUnit ? 'justify-start ps-2 text-start' : 'justify-center text-center'}`}
    >
      <FormattedMessage
        id="station.arrival_timings.then"
        defaultMessage="<label>then</label> {time}"
        values={{
          label: (label) => <span className="sr-only">{label}</span>,
          time: value,
        }}
      />
    </span>
  ) : (
    <span className="inline-flex min-w-0 items-center justify-center py-1.5 text-center">
      {value}
    </span>
  );
}

function formatWait(minutes: number, intl: IntlShape, showUnit: boolean) {
  const unit = (text: ReactNode) => (
    <span
      className={
        showUnit
          ? 'font-medium text-gray-500 text-xs tracking-normal dark:text-gray-400'
          : 'sr-only'
      }
    >
      {text}
    </span>
  );
  return intl.formatMessage(
    {
      id: 'station.arrival_timings.compact_minutes',
      defaultMessage: '{minutes, number} <unit>mins</unit>',
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
