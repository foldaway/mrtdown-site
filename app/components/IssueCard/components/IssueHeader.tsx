import {
  BuildingOfficeIcon,
  CogIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import classNames from 'classnames';
import { FormattedMessage } from 'react-intl';
import type { Issue, IssueInterval } from '~/client';
import { IssueTypeLabels } from '~/constants';
import { IssueStatusBadge } from '../../IssueStatusBadge';
import { IssueTimestamp } from './IssueTimestamp';

interface Props {
  issue: Issue;
  interval: IssueInterval;
}

export const IssueHeader: React.FC<Props> = ({ issue, interval }) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
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
            <CogIcon className="size-3 text-maintenance-light dark:text-maintenance-dark" />
          )}
          {issue.type === 'infra' && (
            <BuildingOfficeIcon className="size-3 text-infra-light dark:text-infra-dark" />
          )}
        </div>
        <span
          className={classNames(
            'inline-flex items-center rounded-md py-0.5 font-medium text-xs',
            {
              ' text-disruption-light dark:text-disruption-dark':
                issue.type === 'disruption',
              ' text-maintenance-light dark:text-maintenance-dark':
                issue.type === 'maintenance',
              ' text-infra-light dark:text-infra-dark': issue.type === 'infra',
            },
          )}
        >
          <FormattedMessage {...IssueTypeLabels[issue.type]} />
        </span>
      </div>

      <div className="flex items-center gap-2 overflow-hidden text-gray-500 text-xs dark:text-gray-400">
        <IssueTimestamp
          interval={interval}
          className="hidden shrink-0 sm:inline"
        />
        <IssueStatusBadge interval={interval} issue={issue} />
      </div>
    </div>
  );
};
