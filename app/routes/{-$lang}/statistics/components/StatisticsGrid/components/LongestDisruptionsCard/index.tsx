import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Collapsible } from 'radix-ui';
import type React from 'react';
import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import { IssueCard } from '~/components/IssueCard';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { StatisticsCard } from '../StatisticsCard';

interface Props {
  issueIds: string[];
}

export const LongestDisruptionsCard: React.FC<Props> = (props) => {
  const { issueIds } = props;

  const includedEntities = useIncludedEntities();

  const issues = useMemo(() => {
    return issueIds.map((issueId) => includedEntities.issues[issueId]);
  }, [issueIds, includedEntities.issues]);

  return (
    <Collapsible.Root asChild>
      <StatisticsCard
        className="group"
        contentClassName="p-3 sm:p-4"
        header={
          <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
            <FormattedMessage
              id="general.longest_disruptions"
              defaultMessage="Longest Disruptions"
            />
          </h2>
        }
      >
        {issues.length === 0 && (
          <div className="flex items-center justify-center rounded-xl border border-gray-300 border-dashed py-8 dark:border-gray-600">
            <p className="text-gray-500 text-sm dark:text-gray-400">
              <FormattedMessage
                id="general.no_longest_disruptions"
                defaultMessage="No disruptions found"
              />
            </p>
          </div>
        )}
        {issues.length > 0 && (
          <div className="flex flex-col">
            <div className="relative">
              <IssueCard
                issue={issues[0]}
                className="!w-auto !rounded-xl !border-gray-200 !px-3 !py-2.5 !shadow-none hover:!border-gray-300 hover:!shadow-sm sm:!px-4 dark:!border-gray-700 dark:hover:!border-gray-600"
              />
              <div className="absolute inset-x-px bottom-px h-12 rounded-b-xl bg-gradient-to-t from-white to-transparent group-data-[state=open]:hidden dark:from-gray-800" />
            </div>
            {issues.length > 1 && (
              <Collapsible.Trigger className="mt-3 shrink-0 self-center rounded-lg bg-accent-light px-3 py-1.5 font-semibold text-white text-xs transition-colors hover:bg-accent-dark group-data-[state=open]:hidden">
                <div className="flex items-center justify-between gap-x-2">
                  <FormattedMessage
                    id="general.show_remaining_count"
                    defaultMessage="Show {count, number} more"
                    values={{ count: issues.length - 1 }}
                  />
                  <ChevronDownIcon className="size-4" />
                </div>
              </Collapsible.Trigger>
            )}
            <Collapsible.Content asChild>
              <div className="mt-3 flex flex-col space-y-3">
                {issues.slice(1).map((issueRef) => (
                  <IssueCard
                    key={issueRef.id}
                    issue={issueRef}
                    className="!w-auto !rounded-xl !border-gray-200 !px-3 !py-2.5 !shadow-none hover:!border-gray-300 hover:!shadow-sm sm:!px-4 dark:!border-gray-700 dark:hover:!border-gray-600"
                  />
                ))}
                <Collapsible.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-x-2 self-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 text-xs hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <FormattedMessage
                      id="general.collapse"
                      defaultMessage="Collapse"
                    />
                    <ChevronUpIcon className="size-4" />
                  </button>
                </Collapsible.Trigger>
              </div>
            </Collapsible.Content>
          </div>
        )}
      </StatisticsCard>
    </Collapsible.Root>
  );
};
