import type React from 'react';
import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { Item } from './components/Item';

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
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-300 p-6 shadow-lg sm:row-span-2 dark:border-gray-700">
      <span className="text-base">
        <FormattedMessage
          id="general.longest_disruptions"
          defaultMessage="Longest Disruptions"
        />
      </span>
      <div className="mt-2.5 flex max-h-40 flex-col gap-y-2.5 overflow-y-scroll sm:max-h-[450px]">
        {issues.map((issueRef) => (
          <Item key={issueRef.id} issue={issueRef} />
        ))}
      </div>
    </div>
  );
};
