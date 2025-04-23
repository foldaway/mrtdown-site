import { Link } from 'react-router';
import type { IssueMaintenance } from '../../../../types';
import { Update } from './components/Update';
import { DateTime, Interval } from 'luxon';
import { useMemo } from 'react';
import { ComponentBar } from '../../../ComponentBar';
import { CogIcon } from '@heroicons/react/24/solid';
import { calculateDurationWithinServiceHours } from '../../../../helpers/calculateDurationWithinServiceHours';
import { useHydrated } from '../../../../hooks/useHydrated';
import { StationMap } from '~/components/StationMap';
import { FormattedDateTimeRange, FormattedMessage } from 'react-intl';
import { FormattedDuration } from '~/components/FormattedDuration';
import { BetaPill } from '../BetaPill';

interface Props {
  issue: IssueMaintenance;
}

export const Maintenance: React.FC<Props> = (props) => {
  const { issue } = props;

  const startAt = useMemo(
    () => DateTime.fromISO(issue.startAt),
    [issue.startAt],
  );
  const endAt = useMemo(() => {
    if (issue.endAt == null) {
      return null;
    }

    return DateTime.fromISO(issue.endAt);
  }, [issue.endAt]);

  const dateTimeInfo = useMemo(() => {
    if (endAt == null) {
      return null;
    }
    return {
      interval: Interval.fromDateTimes(startAt, endAt),
      durationWithinServiceHours: calculateDurationWithinServiceHours(
        startAt,
        endAt,
      ),
    };
  }, [startAt, endAt]);

  const isHydrated = useHydrated();

  return (
    <div className="flex flex-col bg-gray-100 dark:bg-gray-800">
      <Link
        className="group flex items-center gap-x-2 bg-maintenance-light px-4 py-2 text-gray-50 dark:bg-maintenance-dark dark:text-gray-200"
        to={`/issues/${issue.id}`}
      >
        <CogIcon className="size-5 shrink-0 text-gray-50 dark:text-gray-200" />
        <h2 className="font-bold text-base group-hover:underline">
          {issue.title}
        </h2>
      </Link>
      <div className="flex flex-col justify-between gap-1.5 bg-gray-200 px-4 py-2 sm:flex-row sm:items-center dark:bg-gray-700">
        <div className="inline-flex items-center">
          <span className="text-gray-500 text-xs dark:text-gray-400">
            <FormattedMessage
              id="general.affected_components_stations"
              defaultMessage="Affected:"
            />
          </span>
          <ComponentBar componentIds={issue.componentIdsAffected} />
        </div>
        <span className="text-gray-500 text-xs dark:border-gray-300 dark:text-gray-400">
          {dateTimeInfo == null ? (
            <FormattedMessage
              id="general.ongoing_timestamp"
              defaultMessage="{start, date, medium} {start, time, short} to present"
              values={{
                start: startAt.toJSDate(),
              }}
            />
          ) : (
            <>
              {isHydrated ? (
                <FormattedDateTimeRange
                  from={startAt.toJSDate()}
                  to={endAt!.toJSDate()}
                  month="short"
                  day="numeric"
                  year="numeric"
                  hour="numeric"
                  minute="numeric"
                />
              ) : (
                dateTimeInfo.interval.toISO()
              )}{' '}
              [
              {isHydrated ? (
                <FormattedMessage
                  id="general.uptime_duration_display"
                  defaultMessage="{duration} within service hours"
                  values={{
                    duration: (
                      <FormattedDuration
                        duration={dateTimeInfo.durationWithinServiceHours
                          .rescale()
                          .set({ seconds: 0 })
                          .rescale()}
                      />
                    ),
                  }}
                />
              ) : (
                dateTimeInfo.durationWithinServiceHours.toISO()
              )}
              ]
            </>
          )}
        </span>
      </div>
      <div className="flex flex-col gap-y-4 p-4">
        {issue.updates.map((update) => (
          <Update key={update.sourceUrl} update={update} />
        ))}
      </div>

      <div className="flex flex-col gap-y-4 bg-gray-200 p-4 dark:bg-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-500 text-sm group-hover:underline dark:text-gray-400">
            <FormattedMessage
              id="general.affected_stations"
              defaultMessage="Affected Stations"
            />
          </h3>
          <BetaPill />
        </div>
        <StationMap
          componentIdsAffected={issue.componentIdsAffected}
          stationIdsAffected={issue.stationIdsAffected}
        />
      </div>
    </div>
  );
};
