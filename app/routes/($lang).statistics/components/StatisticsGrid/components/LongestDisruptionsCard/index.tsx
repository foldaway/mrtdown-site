import { ClockIcon } from '@heroicons/react/20/solid';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Collapsible } from 'radix-ui';
import type React from 'react';
import { useMemo } from 'react';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import { IssueCard } from '~/components/IssueCard';
import { useIncludedEntities } from '~/contexts/IncludedEntities';

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
      <div className="group col-span-6 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-x-2">
            <div className="flex items-center gap-x-2">
              <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">
                <FormattedMessage
                  id="general.longest_disruptions"
                  defaultMessage="Longest Disruptions"
                />
              </h3>
            </div>
          </div>
        </div>
        {issues.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border-2 border-gray-300 border-dashed py-12 dark:border-gray-600">
            <p className="text-gray-500 dark:text-gray-400">
              <FormattedMessage
                id="general.no_longest_disruptions"
                defaultMessage="No disruptions found"
              />
            </p>
          </div>
        )}
        {issues.length > 0 && (
          <div className="mt-4 flex flex-col">
            <div className="relative">
              <IssueCard issue={issues[0]} className="!w-auto" />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent group-data-[state=open]:hidden dark:from-gray-900" />
            </div>
            {issues.length > 1 && (
              <Collapsible.Trigger className="mt-3 shrink-0 self-center rounded-xl bg-blue-600 px-4 py-2 font-medium text-sm text-white transition-all duration-200 hover:bg-blue-700 hover:shadow-md group-data-[state=open]:hidden dark:bg-blue-700 dark:hover:bg-blue-600">
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
                    className="!w-auto"
                  />
                ))}
                <Collapsible.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-x-2 self-center rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
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
      </div>
    </Collapsible.Root>
  );
};
