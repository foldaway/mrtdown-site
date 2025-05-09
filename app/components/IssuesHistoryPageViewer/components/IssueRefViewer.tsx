import { Link } from 'react-router';
import type { IssueRef } from '../../../types';
import { useMemo } from 'react';
import { DateTime, Interval } from 'luxon';
import { ComponentBar } from '../../ComponentBar';
import classNames from 'classnames';
import {
  BuildingOfficeIcon,
  CogIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/20/solid';
import { calculateDurationWithinServiceHours } from '../../../helpers/calculateDurationWithinServiceHours';
import { useHydrated } from '../../../hooks/useHydrated';
import { FormattedDateTimeRange, FormattedMessage, useIntl } from 'react-intl';
import { FormattedDuration } from '~/components/FormattedDuration';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { assert } from '~/util/assert';
import { IssueSubtypeLabels } from '~/constants';

interface Props {
  issueRef: IssueRef;
}

export const IssueRefViewer: React.FC<Props> = (props) => {
  const { issueRef } = props;

  const startAt = useMemo(
    () => DateTime.fromISO(issueRef.startAt),
    [issueRef.startAt],
  );
  const endAt = useMemo(() => {
    if (issueRef.endAt == null) {
      return null;
    }

    return DateTime.fromISO(issueRef.endAt);
  }, [issueRef.endAt]);

  const dateTimeInfo = useMemo(() => {
    if (endAt == null) {
      return null;
    }
    const interval = Interval.fromDateTimes(startAt, endAt);
    assert(interval.isValid);
    return {
      interval,
      durationWithinServiceHours: calculateDurationWithinServiceHours(
        startAt,
        endAt,
      ),
    };
  }, [startAt, endAt]);

  const isHydrated = useHydrated();
  const intl = useIntl();

  const stationCount = useMemo(() => {
    const result = new Set<string>();
    for (const entry of issueRef.stationIdsAffected) {
      for (const stationId of entry.stationIds) {
        result.add(stationId);
      }
    }
    return result.size;
  }, [issueRef.stationIdsAffected]);

  return (
    <div className="flex flex-col bg-gray-100 dark:bg-gray-800">
      <Link
        className={classNames(
          'group grid grid-cols-[auto_1fr] grid-rows-[1fr_auto] items-center justify-between gap-x-2 gap-y-0.5 px-4 py-2 md:grid-cols-[auto_1fr_1fr] md:grid-rows-1',
          {
            'bg-disruption-light dark:bg-disruption-dark':
              issueRef.type === 'disruption',
            'bg-maintenance-light dark:bg-maintenance-dark':
              issueRef.type === 'maintenance',
            'bg-infra-light dark:bg-infra-dark': issueRef.type === 'infra',
          },
        )}
        to={buildLocaleAwareLink(`/issues/${issueRef.id}`, intl.locale)}
      >
        {issueRef.type === 'disruption' && (
          <ExclamationTriangleIcon className="size-5 shrink-0 text-gray-50 dark:text-gray-200" />
        )}
        {issueRef.type === 'maintenance' && (
          <CogIcon className="size-5 shrink-0 text-gray-50 dark:text-gray-200" />
        )}
        {issueRef.type === 'infra' && (
          <BuildingOfficeIcon className="size-5 shrink-0 text-gray-50 dark:text-gray-200" />
        )}

        <h2 className="truncate font-bold text-base text-gray-50 group-hover:underline dark:text-gray-200">
          {issueRef.title}
        </h2>

        <div className="col-start-2 col-end-2 flex items-center gap-x-1 md:col-start-3 md:col-end-3 md:justify-end">
          {issueRef.subtypes.map((subtype) => (
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
      <div className="flex justify-between gap-1.5 overflow-hidden bg-gray-200 px-4 py-2 sm:items-center dark:bg-gray-800">
        <div className="inline-flex flex-col gap-x-1.5 md:flex-row md:items-center">
          <ComponentBar componentIds={issueRef.componentIdsAffected} />
          <span className="text-gray-500 text-xs dark:text-gray-400">
            <FormattedMessage
              id="general.station_count"
              defaultMessage="{count, plural, one { {count} stations } other { {count} stations }}"
              values={{ count: stationCount }}
            />
          </span>
        </div>
        <div className="flex shrink-0 flex-col text-end">
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
          </span>
          {dateTimeInfo != null && (
            <span className="text-gray-400 text-xs dark:border-gray-300 dark:text-gray-500">
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
    </div>
  );
};
