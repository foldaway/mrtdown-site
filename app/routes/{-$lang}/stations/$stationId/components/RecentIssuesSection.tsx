import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import { IssueCard } from '~/components/IssueCard';
import type { IssueCardContext } from '~/components/IssueCard/types';
import { useIncludedEntities } from '~/contexts/IncludedEntities';

interface Props {
  issueIds: string[];
}

export const RecentIssuesSection: React.FC<Props> = (props) => {
  const { issueIds } = props;
  const { issues } = useIncludedEntities();

  const issueCardContext = useMemo<IssueCardContext>(() => {
    return {
      type: 'history.days',
      date: DateTime.now().startOf('day').minus({ days: 30 }).toISODate(),
      days: 30,
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg dark:border-gray-600/60 dark:bg-gray-800">
      <div className="p-4 sm:p-6">
        <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
          <FormattedMessage
            id="station.recent_issues"
            defaultMessage="Recent Issues"
          />
        </h2>

        <div className="mt-4 space-y-3">
          {issueIds.length > 0 ? (
            issueIds.map((issueId) => {
              const issue = issues[issueId];

              return (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  className="!w-auto"
                  context={issueCardContext}
                />
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <InformationCircleIcon className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              <p className="mt-3 text-gray-600 dark:text-gray-400">
                <FormattedMessage
                  id="station.no_recent_issues"
                  defaultMessage="No recent issues reported for this station"
                />
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
