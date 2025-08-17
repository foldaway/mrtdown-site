import { ClockIcon } from '@heroicons/react/24/outline';
import { FormattedMessage } from 'react-intl';
import { IssueCard } from '~/components/IssueCard';
import { useIncludedEntities } from '~/contexts/IncludedEntities';

interface Props {
  issueIds: string[];
}

export const RecentIssuesSection: React.FC<Props> = (props) => {
  const { issueIds } = props;

  const { issues } = useIncludedEntities();

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-gray-800 md:col-span-12 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200">
      <div className="mb-4 flex items-center gap-x-3">
        <ClockIcon className="size-6 text-gray-600 dark:text-gray-400" />
        <h2 className="font-bold text-gray-900 text-xl dark:text-gray-100">
          <FormattedMessage
            id="general.component_status.recent_issues"
            defaultMessage="Recent issues"
          />
        </h2>
      </div>
      {issueIds.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {issueIds.map((id) => (
            <IssueCard key={id} issue={issues[id]} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-lg border-2 border-gray-300 border-dashed py-12 dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400">
            <FormattedMessage
              id="general.no_recent_issues"
              defaultMessage="No recent issues reported"
            />
          </p>
        </div>
      )}
    </section>
  );
};
