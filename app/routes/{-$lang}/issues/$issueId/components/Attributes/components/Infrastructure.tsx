import { DateTime } from 'luxon';
import { FormattedDateTimeRange, FormattedMessage } from 'react-intl';
import type { Issue } from '~/types';

interface Props {
  issue: Issue;
}

export const Infrastructure: React.FC<Props> = (props) => {
  const { issue } = props;
  const { intervals } = issue;

  return (
    <>
      <div>
        <dt className="font-medium text-[11px] text-gray-500 uppercase tracking-wide dark:text-gray-400">
          <FormattedMessage
            id="general.maintenance_period"
            defaultMessage="Maintenance Period"
          />
        </dt>
        <dd className="mt-0.5 font-medium text-gray-800 text-sm leading-5 dark:text-gray-200">
          <FormattedDateTimeRange
            from={DateTime.fromISO(intervals[0].startAt).toMillis()}
            to={DateTime.fromISO(
              intervals[intervals.length - 1].startAt,
            ).toMillis()}
            dateStyle="medium"
          />
        </dd>
      </div>

      <div>
        <dt className="font-medium text-[11px] text-gray-500 uppercase tracking-wide dark:text-gray-400">
          <FormattedMessage
            id="general.active_intervals"
            defaultMessage="Active Intervals"
          />
        </dt>
        <dd className="mt-0.5 flex flex-col gap-1 font-medium text-gray-800 text-sm leading-5 dark:text-gray-200">
          {intervals.map((interval) => {
            if (interval.endAt == null) {
              return (
                <span key={interval.startAt}>
                  <FormattedMessage
                    id="general.ongoing_timestamp"
                    defaultMessage="{start, date, medium} {start, time, short} to present"
                    values={{
                      start: interval.startAt,
                    }}
                  />
                </span>
              );
            }

            return (
              <span key={interval.startAt}>
                <FormattedDateTimeRange
                  from={DateTime.fromISO(interval.startAt).toMillis()}
                  to={DateTime.fromISO(interval.endAt).toMillis()}
                  dateStyle="medium"
                  timeStyle="short"
                />
              </span>
            );
          })}
        </dd>
      </div>
    </>
  );
};
