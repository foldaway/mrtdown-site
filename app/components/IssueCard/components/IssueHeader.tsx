import {
  BuildingOfficeIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Cog8ToothIcon } from '@heroicons/react/24/solid';
import classNames from 'classnames';
import { FormattedMessage } from 'react-intl';
import type { Issue, IssueInterval } from '~/types';
import { IssueSubtypeLabels, IssueTypeLabels } from '~/constants';
import { IssueStatusBadge } from '../../IssueStatusBadge';
import { IssueTimestamp } from './IssueTimestamp';

interface Props {
  issue: Issue;
  interval: IssueInterval;
}

export const IssueHeader: React.FC<Props> = ({ issue, interval }) => {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div
          className={classNames(
            'flex size-5 shrink-0 items-center justify-center rounded-full',
            {
              'bg-disruption-light/20 ring-1 ring-disruption-light/40 dark:bg-disruption-dark/30 dark:ring-disruption-dark/60':
                issue.type === 'disruption',
              'bg-maintenance-light/20 ring-1 ring-maintenance-light/40 dark:bg-maintenance-dark/30 dark:ring-maintenance-dark/60':
                issue.type === 'maintenance',
              'bg-infra-light/20 ring-1 ring-infra-light/40 dark:bg-infra-dark/30 dark:ring-infra-dark/60':
                issue.type === 'infra',
            },
          )}
        >
          {issue.type === 'disruption' && (
            <ExclamationTriangleIcon className="size-3 text-disruption-light dark:text-disruption-dark" />
          )}
          {issue.type === 'maintenance' && (
            <Cog8ToothIcon className="size-3 text-maintenance-light dark:text-maintenance-dark" />
          )}
          {issue.type === 'infra' && (
            <BuildingOfficeIcon className="size-3 text-infra-light dark:text-infra-dark" />
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs">
          <span
            className={classNames('font-medium', {
              'text-disruption-light dark:text-disruption-dark':
                issue.type === 'disruption',
              'text-maintenance-light dark:text-maintenance-dark':
                issue.type === 'maintenance',
              'text-infra-light dark:text-infra-dark': issue.type === 'infra',
            })}
          >
            <FormattedMessage {...IssueTypeLabels[issue.type]} />
          </span>
          {issue.subtypes.map((subtype) => (
            <span
              key={subtype}
              className="whitespace-nowrap text-gray-500 dark:text-gray-400"
            >
              <span aria-hidden="true" className="mr-1 text-gray-400">
                ·
              </span>
              <FormattedMessage {...IssueSubtypeLabels[subtype]} />
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-gray-500 text-xs dark:text-gray-400">
        <IssueTimestamp
          interval={interval}
          className="hidden shrink-0 sm:inline"
        />
        <IssueStatusBadge interval={interval} issue={issue} />
      </div>
    </div>
  );
};
