import {
  BuildingOfficeIcon,
  CogIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { FormattedDateTimeRange, FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import type { Issue } from '~/client';
import { IssueTypeLabels } from '~/constants';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { IssueAffectedBranchPill } from './IssueAffectedBranchPill';

interface Props {
  issue: Issue;
  className?: string;
}

export const IssueCard: React.FC<Props> = (props) => {
  const { issue, className } = props;

  const intl = useIntl();

  const interval = useMemo(() => {
    return (
      issue.intervals.sort((a, b) => {
        switch (a.status) {
          case 'ongoing':
          case 'future': {
            return -1;
          }
        }

        switch (b.status) {
          case 'ongoing':
          case 'future': {
            return 1;
          }
        }

        return 0;
      })?.[0] ?? null
    );
  }, [issue.intervals]);

  return (
    <div
      className={classNames(
        'flex w-md shrink-0 flex-col rounded-2xl border border-gray-200 bg-white p-4 text-gray-800 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200',
        className,
      )}
    >
      <div className="flex items-center gap-x-2">
        <div
          className={classNames(
            'flex size-7 items-center justify-center rounded-full shadow-sm',
            {
              'bg-disruption-light/20 ring-2 ring-disruption-light/30 dark:bg-disruption-dark/30 dark:ring-disruption-dark/50':
                issue.type === 'disruption',
              'bg-maintenance-light/20 ring-2 ring-maintenance-light/30 dark:bg-maintenance-dark/30 dark:ring-maintenance-dark/50':
                issue.type === 'maintenance',
              'bg-infra-light/20 ring-2 ring-infra-light/30 dark:bg-infra-dark/30 dark:ring-infra-dark/50':
                issue.type === 'infra',
            },
          )}
        >
          {issue.type === 'disruption' && (
            <ExclamationTriangleIcon className="size-4 shrink-0 text-disruption-light dark:text-disruption-dark" />
          )}
          {issue.type === 'maintenance' && (
            <CogIcon className="size-4 shrink-0 text-maintenance-light dark:text-maintenance-dark" />
          )}
          {issue.type === 'infra' && (
            <BuildingOfficeIcon className="size-4 shrink-0 text-infra-light dark:text-infra-dark" />
          )}
        </div>
        <span
          className={classNames('font-medium text-sm', {
            'text-disruption-light dark:text-disruption-dark':
              issue.type === 'disruption',
            'text-maintenance-light dark:text-maintenance-dark':
              issue.type === 'maintenance',
            'text-infra-light dark:text-infra-dark': issue.type === 'infra',
          })}
        >
          <FormattedMessage {...IssueTypeLabels[issue.type]} />
        </span>
      </div>

      <Link
        className="mt-2 hover:underline"
        to={buildLocaleAwareLink(`/issues/${issue.id}`, intl.locale)}
      >
        <span className="font-semibold text-base text-gray-800 leading-snug dark:text-gray-200">
          {issue.titleTranslations[intl.locale] ?? issue.title}
        </span>
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {issue.branchesAffected.map((branch) => (
          <IssueAffectedBranchPill
            key={`${branch.branchId}@${branch.lineId}`}
            branch={branch}
          />
        ))}
      </div>

      <span className="mt-2 text-gray-500 text-sm dark:text-gray-400">
        {interval != null ? (
          <>
            {interval.endAt != null ? (
              <FormattedDateTimeRange
                timeStyle="short"
                dateStyle="medium"
                from={DateTime.fromISO(interval.startAt).toMillis()}
                to={DateTime.fromISO(interval.endAt).toMillis()}
              />
            ) : (
              <FormattedMessage
                id="general.ongoing_timestamp"
                defaultMessage="{start, date, medium} {start, time, short} to present"
                values={{
                  start: interval.startAt,
                }}
              />
            )}
          </>
        ) : (
          <p>Unknown Interval</p>
        )}
      </span>
    </div>
  );
};
