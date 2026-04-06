import { DateTime } from 'luxon';
import { FormattedDateTimeRange, FormattedMessage } from 'react-intl';
import type { Issue } from '~/client';

interface Props {
  issue: Issue;
}

export const Infrastructure: React.FC<Props> = (props) => {
  const { issue } = props;
  const { intervals } = issue;

  return (
    <>
      <div>
        <dt className="text-gray-500 text-xs uppercase dark:text-gray-400">
          <FormattedMessage
            id="general.maintenance_period"
            defaultMessage="Maintenance Period"
          />
        </dt>
        <dd className="font-medium text-base text-gray-800 dark:text-gray-200">
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
        <dt className="text-gray-500 text-xs uppercase dark:text-gray-400">
          <FormattedMessage
            id="general.active_intervals"
            defaultMessage="Active Intervals"
          />
        </dt>
        <dd className="font-medium text-base text-gray-800 dark:text-gray-200">
          {intervals.map((interval) => {
            if (interval.endAt == null) {
              return (
                <FormattedMessage
                  id="general.ongoing_timestamp"
                  defaultMessage="{start, date, medium} {start, time, short} to present"
                  values={{
                    start: interval.startAt,
                  }}
                />
              );
            }

            return (
              <FormattedDateTimeRange
                key={interval.startAt}
                from={DateTime.fromISO(interval.startAt).toMillis()}
                to={DateTime.fromISO(interval.endAt).toMillis()}
                dateStyle="medium"
                timeStyle="short"
              />
            );
          })}
        </dd>
      </div>
    </>
  );
};
