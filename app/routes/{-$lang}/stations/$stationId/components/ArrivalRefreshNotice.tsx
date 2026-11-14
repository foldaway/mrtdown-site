import { FormattedMessage } from 'react-intl';
import type { BranchArrivalState } from './stationArrivalRefresh';

type ArrivalRefreshNoticeProps = {
  state?: BranchArrivalState;
};
export function ArrivalRefreshNotice({ state }: ArrivalRefreshNoticeProps) {
  return (
    <p
      aria-live="polite"
      className="mt-1 text-gray-500 text-xs empty:mt-0 dark:text-gray-400"
    >
      {state?.status === 'error' ? (
        state.data ? (
          <FormattedMessage
            id="station.arrivals.stale"
            defaultMessage="Refresh failed. Showing the last known response; times may be out of date."
          />
        ) : (
          <FormattedMessage
            id="station.arrivals.refresh_failed"
            defaultMessage="Couldn’t load timetable"
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
            id="station.arrivals.loading"
            defaultMessage="Checking timetable…"
          />
        )
      ) : null}
    </p>
  );
}
