import { FormattedMessage, useIntl } from 'react-intl';
import type { StationArrivalsV2 } from '~/util/stationArrivalsV2';
import { PlatformSign } from './StationGuideSigns';
import type { BranchArrivalState } from './stationArrivalRefresh';

type ScheduledArrivalStatusProps = {
  data: Extract<StationArrivalsV2, { source: 'scheduled' }>;
  lineColor: string;
};

export function ScheduledArrivalStatus({
  data,
  lineColor,
}: ScheduledArrivalStatusProps) {
  const intl = useIntl();
  const hasDepartures = data.timings.some(
    (timing) => timing.departures.length > 0,
  );
  return (
    <div className="min-w-0 space-y-2 text-gray-700 text-xs sm:max-w-sm dark:text-gray-300">
      {!data.coverage.complete && (
        <p aria-live="polite">
          <FormattedMessage
            id="station.arrivals.incomplete"
            defaultMessage="Incomplete timetable. Some departures may be missing or have no time."
          />
        </p>
      )}
      {!hasDepartures && (
        <p>
          {data.coverage.complete ? (
            <FormattedMessage
              id="station.arrivals.empty_window"
              defaultMessage="No scheduled departures between {start} and {end} (Singapore time)."
              values={{
                start: intl.formatTime(data.window.startInstant, {
                  timeZone: 'Asia/Singapore',
                }),
                end: intl.formatTime(data.window.endInstant, {
                  timeZone: 'Asia/Singapore',
                }),
              }}
            />
          ) : (
            <FormattedMessage
              id="station.arrivals.no_timed_departures"
              defaultMessage="No timed departures available in this window. Please check station displays."
            />
          )}
        </p>
      )}
      {data.timings.map((timing) => (
        <div key={JSON.stringify(timing.platforms.map(({ id }) => id))}>
          {timing.platforms.length > 0 && (
            <div className="mb-1 flex flex-wrap items-center gap-1">
              {timing.platforms.map((platform) => (
                <span className="inline-flex" key={platform.id}>
                  <PlatformSign color={lineColor} label={platform.label} />
                  <span className="sr-only">
                    <FormattedMessage
                      id="station.arrival_timings.platform"
                      defaultMessage="Platform {label}"
                      values={{ label: platform.label }}
                    />
                  </span>
                </span>
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
          <ol className="flex flex-wrap gap-x-4 gap-y-2 tabular-nums">
            {timing.departures.map((departure) => (
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
                <p className="font-bold text-gray-900 text-sm dark:text-gray-100">
                  {intl.formatTime(departure.time, {
                    timeZone: 'Asia/Singapore',
                  })}
                </p>
                <p>
                  {departure.precision === 'exact' ? (
                    <FormattedMessage
                      id="station.arrivals.scheduled"
                      defaultMessage="Scheduled"
                    />
                  ) : (
                    <FormattedMessage
                      id="station.arrivals.approximate_scheduled"
                      defaultMessage="Approximate scheduled"
                    />
                  )}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

type ArrivalRefreshNoticeProps = {
  state?: BranchArrivalState;
  hasScope: boolean;
};
export function ArrivalRefreshNotice({
  state,
  hasScope,
}: ArrivalRefreshNoticeProps) {
  return (
    <p
      aria-live="polite"
      className="mt-1 text-gray-500 text-xs dark:text-gray-400"
    >
      {!hasScope ? (
        <FormattedMessage
          id="station.arrivals.missing_scope"
          defaultMessage="Initial estimate only. Arrival refresh is unavailable for this service."
        />
      ) : state?.status === 'error' ? (
        state.data ? (
          <FormattedMessage
            id="station.arrivals.stale"
            defaultMessage="Refresh failed. Showing the last known response; times may be out of date."
          />
        ) : (
          <FormattedMessage
            id="station.arrivals.initial_failed"
            defaultMessage="Refresh failed. Initial estimates may be out of date."
          />
        )
      ) : state?.status === 'loading' || !state ? (
        state?.data ? (
          <FormattedMessage
            id="station.arrivals.refreshing"
            defaultMessage="Refreshing arrivals… Showing the last known response."
          />
        ) : (
          <FormattedMessage
            id="station.arrivals.initial_loading"
            defaultMessage="Initial estimates · Checking timetable…"
          />
        )
      ) : null}
    </p>
  );
}
