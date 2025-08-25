import classNames from 'classnames';
import { useMemo } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import type { Line, LineSummaryStatus } from '~/client';
import { LineSummaryStatusLabels } from '~/constants';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';

interface Props {
  line: Line;
  status: LineSummaryStatus;
  issueIdsOngoing: string[];
}

export const LineItem: React.FC<Props> = (props) => {
  const { line, status, issueIdsOngoing } = props;

  const intl = useIntl();

  const { issues } = useIncludedEntities();
  const issuesOngoing = useMemo(() => {
    return issueIdsOngoing.map((id) => issues[id]);
  }, [issueIdsOngoing, issues]);

  return (
    <div className="p-6 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <div className="flex items-center gap-x-3">
        <span
          className="rounded-md px-2.5 py-1 font-bold text-white text-xs shadow-sm"
          style={{ backgroundColor: line.color }}
        >
          {line.id}
        </span>

        <Link
          to={buildLocaleAwareLink(`/lines/${line.id}`, intl.locale)}
          className="group flex-1"
        >
          <h2 className="font-semibold text-gray-800 transition-colors group-hover:text-blue-600 dark:text-gray-200 dark:group-hover:text-blue-400">
            {line.titleTranslations[intl.locale] ?? line.title}
          </h2>
        </Link>

        <div className="flex items-center gap-x-2">
          <div
            className={classNames('size-2 rounded-full shadow-sm', {
              'bg-disruption-light dark:bg-disruption-dark':
                status === 'ongoing_disruption',
              'bg-maintenance-light dark:bg-maintenance-dark':
                status === 'ongoing_maintenance',
              'bg-infra-light dark:bg-infra-dark': status === 'ongoing_infra',
              'bg-operational-light dark:bg-operational-dark':
                status === 'normal',
              'bg-gray-400 dark:bg-gray-500':
                status === 'closed_for_day' || status === 'future_service',
            })}
          />
          <span
            className={classNames('font-medium text-sm capitalize', {
              'text-disruption-light dark:text-disruption-dark':
                status === 'ongoing_disruption',
              'text-maintenance-light dark:text-maintenance-dark':
                status === 'ongoing_maintenance',
              'text-infra-light dark:text-infra-dark':
                status === 'ongoing_infra',
              'text-operational-light dark:text-operational-dark':
                status === 'normal',
              'text-gray-500 dark:text-gray-400':
                status === 'closed_for_day' || status === 'future_service',
            })}
          >
            <FormattedMessage {...LineSummaryStatusLabels[status]} />
          </span>
        </div>
      </div>

      {issuesOngoing.length > 0 && (
        <div className="mt-4 space-y-2">
          {issuesOngoing.map((issue) => (
            <Link
              key={issue.id}
              to={buildLocaleAwareLink(`/issues/${issue.id}`, intl.locale)}
              className="group block"
            >
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 transition-all group-hover:border-blue-300 group-hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-700/50 dark:group-hover:border-blue-500 dark:group-hover:bg-blue-900/20">
                <p className="font-medium text-gray-700 text-sm group-hover:text-blue-700 dark:text-gray-300 dark:group-hover:text-blue-300">
                  {issue.titleTranslations[intl.locale] ?? issue.title}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
