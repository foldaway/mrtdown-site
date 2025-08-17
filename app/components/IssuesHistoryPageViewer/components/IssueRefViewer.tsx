import {
  BuildingOfficeIcon,
  CogIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/20/solid';
import classNames from 'classnames';
import { DateTime, Duration, Interval } from 'luxon';
import { Fragment, useMemo } from 'react';
import {
  FormattedDateTimeRange,
  FormattedMessage,
  FormattedNumber,
  useIntl,
} from 'react-intl';
import { Link } from 'react-router';
import type { Issue } from '~/client';
import { FormattedDuration } from '~/components/FormattedDuration';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { assert } from '~/util/assert';
import { useHydrated } from '../../../hooks/useHydrated';
import { ComponentBar } from '../../ComponentBar';

interface Props {
  issue: Issue;
}

export const IssueRefViewer: React.FC<Props> = (props) => {
  const { issue } = props;

  const isHydrated = useHydrated();
  const intl = useIntl();

  const { lines } = useIncludedEntities();

  const affectedLines = useMemo(() => {
    assert(issue.lineIds != null);
    return issue.lineIds.map((lineId) => lines[lineId]);
  }, [issue.lineIds, lines]);

  const stationCount = useMemo(() => {
    const stationIds = new Set<string>();
    for (const branch of issue.branchesAffected) {
      for (const stationId of branch.stationIds) {
        stationIds.add(stationId);
      }
    }
    return stationIds.size;
  }, [issue.branchesAffected]);

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
        to={buildLocaleAwareLink(`/issues/${issue.id}`, intl.locale)}
      >
        {issue.type === 'disruption' && (
          <ExclamationTriangleIcon className="mt-[1px] size-5 shrink-0 text-gray-50 md:mt-0 dark:text-gray-200" />
        )}
        {issue.type === 'maintenance' && (
          <CogIcon className="mt-[1px] size-5 shrink-0 text-gray-50 md:mt-0 dark:text-gray-200" />
        )}
        {issue.type === 'infra' && (
          <BuildingOfficeIcon className="mt-[1px] size-5 shrink-0 text-gray-50 md:mt-0 dark:text-gray-200" />
        )}

        <h2 className="font-bold text-base text-gray-50 leading-tight group-hover:underline dark:text-gray-200">
          {issue.titleTranslations[intl.locale] ?? issue.title}
        </h2>

        <div className="col-start-2 col-end-2 flex items-center gap-x-1 md:col-start-3 md:col-end-3 md:justify-end">
          {/*{issueRef.subtypes.map((subtype) => (
            <div
              key={subtype}
              className="flex rounded-md bg-gray-300 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            >
              <span className="font-bold text-xs leading-none">
                <FormattedMessage {...IssueSubtypeLabels[subtype]} />
              </span>
            </div>
          ))}*/}
        </div>
      </Link>
      <div className="flex flex-col justify-between gap-1.5 overflow-hidden bg-gray-200 px-4 py-2.5 sm:flex-row sm:items-center sm:py-2 dark:bg-gray-800">
        <div className="inline-flex items-center gap-x-1.5">
          <ComponentBar components={affectedLines} />
          <span className="text-gray-500 text-xs dark:text-gray-400">
            <FormattedMessage
              id="general.station_count"
              defaultMessage="{count, plural, one { {count} station } other { {count} stations }}"
              values={{ count: stationCount }}
            />
          </span>
        </div>
        <div className="flex shrink-0 flex-col sm:text-end">
          <span className="truncate font-bold text-gray-500 text-xs dark:border-gray-300 dark:text-gray-400">
            {issue.intervals.length === 1 &&
            issue.intervals[0].endAt == null ? (
              <FormattedMessage
                id="general.ongoing_timestamp"
                defaultMessage="{start, date, medium} {start, time, short} to present"
                values={{
                  start: issue.intervals[0].startAt,
                }}
              />
            ) : (
              issue.intervals.map((interval) => (
                <Fragment key={interval.startAt}>
                  {isHydrated ? (
                    <FormattedDateTimeRange
                      from={DateTime.fromISO(interval.startAt).toJSDate()}
                      to={DateTime.fromISO(interval.endAt).toJSDate()}
                      month="short"
                      day="numeric"
                      year="numeric"
                      hour="numeric"
                      minute="numeric"
                    />
                  ) : (
                    Interval.fromDateTimes(
                      DateTime.fromISO(interval.startAt),
                      interval.endAt
                        ? DateTime.fromISO(interval.endAt)
                        : DateTime.now(),
                    ).toISO()
                  )}
                </Fragment>
              ))
            )}

            {issue.intervals.length > 1 && (
              <div className="ms-1 inline-block rounded-lg bg-gray-300 px-1.5 py-0.5 dark:bg-gray-700">
                <FormattedNumber value={issue.intervals.length} />x
              </div>
            )}
          </span>
          <span className="text-gray-400 text-xs leading-none dark:border-gray-300 dark:text-gray-500">
            {isHydrated ? (
              <FormattedMessage
                id="general.uptime_duration_display"
                defaultMessage="{duration} within service hours"
                values={{
                  duration: (
                    <FormattedDuration
                      duration={Duration.fromObject({
                        seconds: issue.durationSeconds,
                      })
                        .rescale()
                        .set({ seconds: 0 })
                        .rescale()}
                    />
                  ),
                }}
              />
            ) : (
              Duration.fromObject({ seconds: issue.durationSeconds }).toISO()
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
