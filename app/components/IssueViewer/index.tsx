import * as Popover from '@radix-ui/react-popover';
import {
  ArrowPathIcon,
  BuildingOfficeIcon,
  CogIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/solid';
import classNames from 'classnames';
import { DateTime, Interval } from 'luxon';
import { useMemo } from 'react';
import {
  FormattedDateTimeRange,
  FormattedMessage,
  FormattedNumber,
} from 'react-intl';
import { Link } from 'react-router';
import { IssueSubtypeLabels } from '~/constants';
import { calculateDurationWithinServiceHours } from '~/helpers/calculateDurationWithinServiceHours';
import { useHydrated } from '~/hooks/useHydrated';
import type { Issue } from '../../types';
import { ComponentBar } from '../ComponentBar';
import { FormattedDuration } from '../FormattedDuration';
import { StationMap } from '../StationMap';
import { BetaPill } from './components/BetaPill';
import { UpdateDisruption } from './components/UpdateDisruption';
import { UpdateInfra } from './components/UpdateInfra';
import { UpdateMaintenance } from './components/UpdateMaintenance';
import { countIssueStations } from '~/helpers/countIssueStations';
import { rrulestr } from 'rrule';
import { computeIssueIntervals } from '~/helpers/computeIssueIntervals';

interface Props {
  issue: Issue;
}

export const IssueViewer: React.FC<Props> = (props) => {
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

  const stationCount = useMemo(() => {
    return countIssueStations(issue);
  }, [issue]);

  const isHydrated = useHydrated();

  const intervals = useMemo(() => computeIssueIntervals(issue), [issue]);

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
        <h2 className="font-bold text-base text-gray-50 group-hover:underline dark:text-gray-200">
          {issue.title}
        </h2>

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
      <div className="flex justify-between gap-1.5 bg-gray-100 px-4 py-2 sm:flex-row sm:items-center dark:bg-gray-800">
        <div className="inline-flex flex-wrap items-center gap-x-1.5">
          <ComponentBar componentIds={issue.componentIdsAffected} />
          <span className="text-gray-500 text-xs dark:text-gray-400">
            <FormattedMessage
              id="general.station_count"
              defaultMessage="{count, plural, one { {count} stations } other { {count} stations }}"
              values={{ count: stationCount }}
            />
          </span>
        </div>
        <div className="flex flex-col text-end">
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
                )}
              </>
            )}

            {intervals.length > 1 && (
              <Popover.Root>
                <Popover.Trigger className="ms-1 rounded-lg bg-gray-300 px-1.5 py-0.5 hover:cursor-pointer hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600">
                  <FormattedNumber
                    value={intervals.length - 1}
                    signDisplay="always"
                    unit="day"
                    style="unit"
                  />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content className="flex max-h-96 flex-col overflow-y-scroll rounded border border-gray-300 bg-gray-100 py-2 outline-none dark:border-gray-600 dark:bg-gray-800">
                    <Popover.Arrow className="fill-gray-300 dark:fill-gray-800" />

                    {intervals.slice(1).map((interval) => (
                      <div
                        key={interval.toISO()}
                        className="px-4 py-1.5 text-gray-600 text-xs even:bg-gray-200 dark:text-gray-300 dark:even:bg-gray-700"
                      >
                        {isHydrated ? (
                          <span className="truncate font-bold text-gray-500 text-xs dark:border-gray-300 dark:text-gray-400">
                            <FormattedDateTimeRange
                              from={interval.start.toJSDate()}
                              to={interval.end.toJSDate()}
                              month="short"
                              day="numeric"
                              year="numeric"
                              hour="numeric"
                              minute="numeric"
                            />
                          </span>
                        ) : (
                          interval.toISO()
                        )}
                      </div>
                    ))}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
          </span>

          {dateTimeInfo != null && (
            <span className="text-gray-500 text-xs dark:border-gray-300 dark:text-gray-400">
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
