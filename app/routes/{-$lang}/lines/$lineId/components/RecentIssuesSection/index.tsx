import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Collapsible } from 'radix-ui';
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
    <Collapsible.Root asChild>
      <section className="group rounded-lg border border-gray-200 bg-gray-50 p-6 text-gray-800 md:col-span-12 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-x-2">
            <h2 className="font-semibold text-base text-gray-900 dark:text-white">
              <FormattedMessage
                id="general.component_status.recent_issues"
                defaultMessage="Recent issues"
              />
            </h2>
          </div>
        </div>
        {issueIds.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border-2 border-gray-300 border-dashed py-12 dark:border-gray-600">
            <p className="text-base text-gray-500 dark:text-gray-400">
              <FormattedMessage
                id="general.no_recent_issues"
                defaultMessage="No recent issues reported"
              />
            </p>
          </div>
        )}
        {issueIds.length > 0 && (
          <div className="mt-4 flex flex-col">
            <div className="relative">
              <IssueCard issue={issues[issueIds[0]]} className="!w-auto" />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-gray-50 to-transparent group-data-[state=open]:hidden dark:from-gray-800/50" />
            </div>
            {issueIds.length > 1 && (
              <Collapsible.Trigger className="mt-3 shrink-0 self-center rounded-xl bg-blue-600 px-4 py-2 font-medium text-sm text-white transition-all duration-200 hover:bg-blue-700 hover:shadow-md group-data-[state=open]:hidden dark:bg-blue-700 dark:hover:bg-blue-600">
                <div className="flex items-center justify-between gap-x-2">
                  <FormattedMessage
                    id="general.show_remaining_count"
                    defaultMessage="Show {count, number} more"
                    values={{ count: issueIds.length - 1 }}
                  />
                  <ChevronDownIcon className="size-4" />
                </div>
              </Collapsible.Trigger>
            )}
            <Collapsible.Content asChild>
              <div className="mt-3 flex flex-col space-y-3">
                {issueIds.slice(1).map((id) => (
                  <IssueCard key={id} issue={issues[id]} className="!w-auto" />
                ))}
                <Collapsible.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-x-2 self-center rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <FormattedMessage
                      id="general.hide_details"
                      defaultMessage="Hide details"
                    />
                    <ChevronUpIcon className="size-4" />
                  </button>
                </Collapsible.Trigger>
              </div>
            </Collapsible.Content>
          </div>
        )}
      </section>
    </Collapsible.Root>
  );
};
