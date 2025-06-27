import {
  BuildingOfficeIcon,
  CogIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid';
import classNames from 'classnames';
import { DateTime, Duration, Interval } from 'luxon';
import { useMemo } from 'react';
import { FormattedDateTimeRange, FormattedMessage } from 'react-intl';
import { Link } from 'react-router';
import { IssueSubtypeLabels } from '~/constants';
import { calculateDurationWithinServiceHours } from '~/helpers/calculateDurationWithinServiceHours';
import { computeIssueIntervals } from '~/helpers/computeIssueIntervals';
import { countIssueStations } from '~/helpers/countIssueStations';
import { useHydrated } from '~/hooks/useHydrated';
import { assert } from '~/util/assert';
import type { Issue } from '../../types';
import { ComponentBar } from '../ComponentBar';
import { FormattedDuration } from '../FormattedDuration';
import { StationMap } from '../StationMap';
import { BetaPill } from './components/BetaPill';
import { RecurringIntervalsPill } from './components/RecurringIntervalsPill';
import { UpdateDisruption } from './components/UpdateDisruption';
import { UpdateInfra } from './components/UpdateInfra';
import { UpdateMaintenance } from './components/UpdateMaintenance';

interface Props {
  issue: Issue;
}

export const IssueViewer: React.FC<Props> = (props) => {
  const { issue } = props;

  const startAt = useMemo(
    () => DateTime.fromISO(issue.startAt),
    [issue.startAt],
  );

  const intervals = useMemo(() => computeIssueIntervals(issue), [issue]);

  const dateTimeInfo = useMemo(() => {
    if (intervals.length === 0) {
      return null;
    }

    const intervalFirst = intervals[0];
    const intervalLast = intervals[intervals.length - 1];

    assert(intervalFirst.start != null);
    assert(intervalLast.end != null);

    const intervalOverall = Interval.fromDateTimes(
      intervalFirst.start,
      intervalLast.end,
    );
    assert(intervalOverall.isValid);

    let durationWithinServiceHours = Duration.fromMillis(0);
    for (const interval of intervals) {
      assert(interval.isValid);
      assert(interval.start != null && interval.end != null);
      durationWithinServiceHours = durationWithinServiceHours.plus(
        calculateDurationWithinServiceHours(interval.start, interval.end),
      );
    }

    return {
      intervalOverall,
      durationWithinServiceHours,
    };
  }, [intervals]);

  const stationCount = useMemo(() => {
    return countIssueStations(issue);
  }, [issue]);

  const isHydrated = useHydrated();

  return (
    <div className="flex flex-col bg-gray-100 dark:bg-gray-800">
      <Link
        className={classNames(
          'group grid grid-cols-[auto_1fr] grid-rows-[1fr_auto] justify-between gap-x-2 gap-y-1 px-4 py-2 md:grid-cols-[auto_2fr_1fr] md:grid-rows-1 md:items-center',
          {
            'bg-disruption-light dark:bg-disruption-dark':
              issue.type === 'disruption',
            'bg-maintenance-light dark:bg-maintenance-dark':
              issue.type === 'maintenance',
            'bg-infra-light dark:bg-infra-dark': issue.type === 'infra',
          },
        )}
        to={`/issues/${issue.id}`}
      >
        {issue.type === 'disruption' && (
          <ExclamationTriangleIcon className="mt-[1px] size-5 text-gray-50 md:mt-0 dark:text-gray-200" />
        )}
        {issue.type === 'infra' && (
          <BuildingOfficeIcon className="mt-[1px] size-5 text-gray-50 md:mt-0 dark:text-gray-200" />
        )}
        {issue.type === 'maintenance' && (
          <CogIcon className="mt-[1px] size-5 text-gray-50 md:mt-0 dark:text-gray-200" />
        )}
        <h1 className="font-bold text-base text-gray-50 group-hover:underline dark:text-gray-200">
          {issue.title}
        </h1>

        <div className="col-start-2 col-end-2 flex items-center gap-x-1 md:col-start-3 md:col-end-3 md:justify-end">
          {issue.subtypes.map((subtype) => (
            <div
              key={subtype}
              className="flex rounded-md bg-gray-300 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            >
              <span className="font-bold text-xs leading-none">
                <FormattedMessage {...IssueSubtypeLabels[subtype]} />
              </span>
            </div>
          ))}
        </div>
      </Link>
      <div className="flex flex-col justify-between gap-1.5 bg-gray-100 px-4 py-2.5 sm:flex-row sm:items-center sm:py-2 dark:bg-gray-800">
        <div className="inline-flex items-center gap-x-1.5">
          <ComponentBar componentIds={issue.componentIdsAffected} />
          <span className="text-gray-500 text-xs dark:text-gray-400">
            <FormattedMessage
              id="general.station_count"
              defaultMessage="{count, plural, one { {count} stations } other { {count} stations }}"
              values={{ count: stationCount }}
            />
          </span>
        </div>
        <div className="flex flex-col sm:text-end">
          <span className="truncate font-bold text-gray-500 text-xs dark:border-gray-300 dark:text-gray-400">
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
                    from={dateTimeInfo.intervalOverall.start.toJSDate()}
                    to={dateTimeInfo.intervalOverall.end.toJSDate()}
                    month="short"
                    day="numeric"
                    year="numeric"
                    hour="numeric"
                    minute="numeric"
                  />
                ) : (
                  dateTimeInfo.intervalOverall.toISO()
                )}
              </>
            )}

            {intervals.length > 1 && (
              <RecurringIntervalsPill intervals={intervals} />
            )}
          </span>

          {dateTimeInfo != null && (
            <span className="text-gray-500 text-xs leading-none dark:border-gray-300 dark:text-gray-400">
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
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-y-4 bg-gray-50 p-4 dark:bg-gray-900">
        {issue.type === 'disruption' &&
          issue.updates.map((update) => (
            <UpdateDisruption key={update.sourceUrl} update={update} />
          ))}
        {issue.type === 'maintenance' &&
          issue.updates.map((update) => (
            <UpdateMaintenance key={update.sourceUrl} update={update} />
          ))}
        {issue.type === 'infra' &&
          issue.updates.map((update) => (
            <UpdateInfra key={update.sourceUrl} update={update} />
          ))}
      </div>

      <div className="flex flex-col gap-y-4 bg-gray-100 p-4 dark:bg-gray-800">
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
          currentDate={issue.startAt}
        />
      </div>
    </div>
  );
};
