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
    return {
      interval: Interval.fromDateTimes(startAt, endAt),
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
        className={classNames('group flex items-center gap-x-2 px-4 py-2', {
          'bg-disruption-light dark:bg-disruption-dark':
            issueRef.type === 'disruption',
          'bg-maintenance-light dark:bg-maintenance-dark':
            issueRef.type === 'maintenance',
          'bg-infra-light dark:bg-infra-dark': issueRef.type === 'infra',
        })}
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
        <h2 className="font-bold text-base text-gray-50 group-hover:underline dark:text-gray-200">
          {issueRef.title}
        </h2>
      </Link>
      <div className="flex flex-col justify-between gap-1.5 bg-gray-200 px-4 py-2 sm:flex-row sm:items-center dark:bg-gray-700">
        <div className="inline-flex items-center">
          <span className="me-1 text-gray-500 text-xs dark:text-gray-400">
            <FormattedMessage
              id="general.affected_components_stations"
              defaultMessage="Affected:"
            />
          </span>
          <ComponentBar componentIds={issueRef.componentIdsAffected} />
          <span className="ms-1 text-gray-500 text-xs dark:text-gray-400">
            <FormattedMessage
              id="general.station_count"
              defaultMessage="{count, plural, one { {count} stations } other { {count} stations }}"
              values={{ count: stationCount }}
            />
          </span>
        </div>
        <span className="text-gray-500 text-xs dark:border-gray-300 dark:text-gray-400">
          {dateTimeInfo == null ? (
            'Ongoing'
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
    </div>
  );
};
