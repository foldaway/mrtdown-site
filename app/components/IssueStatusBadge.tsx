import { CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import classNames from 'classnames';
import { FormattedMessage } from 'react-intl';
import type { Issue, IssueInterval } from '~/client';

interface Props {
  interval: IssueInterval;
  issue: Issue;
}

export const IssueStatusBadge: React.FC<Props> = ({ interval, issue }) => {
  return (
    <div
      className={classNames(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ring-1 ring-inset',
        {
          'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-400/30':
            interval.status === 'ongoing',
          'bg-green-50 text-green-800 ring-green-600/20 dark:bg-green-900/30 dark:text-green-200 dark:ring-green-400/30':
            interval.status === 'ended',
          'bg-blue-50 text-blue-800 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-400/30':
            interval.status === 'future',
        },
      )}
    >
      {interval.status === 'ongoing' && (
        <>
          <ClockIcon className="size-3" />
          <FormattedMessage id="general.ongoing" defaultMessage="Ongoing" />
        </>
      )}
      {interval.status === 'ended' && (
        <>
          <CheckCircleIcon className="size-3" />
          {issue.type === 'disruption' ? (
            <FormattedMessage
              id="general.resolved"
              defaultMessage="Resolved"
            />
          ) : (
            <FormattedMessage
              id="general.completed"
              defaultMessage="Completed"
            />
          )}
        </>
      )}
      {interval.status === 'future' && (
        <>
          <ClockIcon className="size-3" />
          <FormattedMessage id="general.planned" defaultMessage="Planned" />
        </>
      )}
    </div>
  );
};