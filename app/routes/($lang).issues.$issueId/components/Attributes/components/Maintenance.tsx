import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { FormattedDateTimeRange, FormattedMessage } from 'react-intl';
import type { Issue } from '~/client';

interface Props {
  issue: Issue;
}

export const Maintenance: React.FC<Props> = (props) => {
  const { issue } = props;
  const { intervals } = issue;

  const { endedIntervalCount, ongoingIntervalCount, futureIntervalCount } =
    useMemo(() => {
      let _endedIntervalCount = 0;
      let _ongoingIntervalCount = 0;
      let _futureIntervalCount = 0;

      for (const interval of intervals) {
        switch (interval.status) {
          case 'ongoing': {
            _ongoingIntervalCount++;
            break;
          }
          case 'future': {
            _futureIntervalCount++;
            break;
          }
          case 'ended': {
            _endedIntervalCount++;
            break;
          }
        }
      }
      return {
        endedIntervalCount: _endedIntervalCount,
        futureIntervalCount: _futureIntervalCount,
        ongoingIntervalCount: _ongoingIntervalCount,
      };
    }, [intervals]);

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
            id="general.work_windows"
            defaultMessage="Work Windows"
          />
        </dt>
        <dd className="font-medium text-base text-gray-800 dark:text-gray-200">
          WIP
        </dd>
      </div>

      <div>
        <dt className="text-gray-500 text-xs uppercase dark:text-gray-400">
          <FormattedMessage id="general.sessions" defaultMessage="Sessions" />
        </dt>
        <dd className="font-medium text-base text-gray-800 dark:text-gray-200">
          <FormattedMessage
            id="general.maintenance_sessions_summary"
            defaultMessage="{endedIntervalCount} ended, {ongoingIntervalCount} ongoing, {futureIntervalCount} remaining"
            values={{
              endedIntervalCount: endedIntervalCount,
              ongoingIntervalCount: ongoingIntervalCount,
              futureIntervalCount: futureIntervalCount,
            }}
          />
        </dd>
      </div>
    </>
  );
};
