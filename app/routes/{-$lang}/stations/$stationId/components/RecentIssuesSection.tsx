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
    <section
      aria-labelledby="station-recent-issues-title"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="px-4 py-2.5 sm:px-6 sm:py-3">
        <h2
          id="station-recent-issues-title"
          className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100"
        >
          <FormattedMessage
            id="station.recent_issues"
            defaultMessage="Recent Issues"
          />
        </h2>
      </div>

      <div className="border-gray-200 border-t px-3 py-3 sm:px-4 dark:border-gray-700">
        <div className="space-y-2.5">
          {issueIds.length > 0 ? (
            issueIds.map((issueId) => {
              const issue = issues[issueId];

              return (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  className="!w-auto !border-gray-200 !px-3.5 !py-2.5 !shadow-none hover:!border-gray-300 hover:!shadow-sm sm:!px-4 sm:!py-3 dark:!border-gray-700 dark:hover:!border-gray-600"
                  context={issueCardContext}
                />
              );
            })
          ) : (
            <div className="flex items-center justify-center gap-2 py-5 text-center">
              <InformationCircleIcon className="size-5 shrink-0 text-gray-400 dark:text-gray-500" />
              <p className="text-gray-500 text-sm leading-5 dark:text-gray-400">
                <FormattedMessage
                  id="station.no_recent_issues"
                  defaultMessage="No recent issues reported for this station"
                />
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
