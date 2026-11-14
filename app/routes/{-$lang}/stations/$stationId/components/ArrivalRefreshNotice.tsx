import { FormattedMessage } from 'react-intl';
import type { BranchArrivalState } from './stationArrivalRefresh';

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
          defaultMessage="Timetable refresh is unavailable for this service."
        />
      ) : state?.status === 'error' ? (
        state.data ? (
          <FormattedMessage
            id="station.arrivals.stale"
            defaultMessage="Refresh failed. Showing the last known response; times may be out of date."
          />
        ) : (
          <FormattedMessage
            id="station.arrivals.refresh_failed"
            defaultMessage="Couldn’t refresh the timetable. Please check station displays."
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
