import type React from 'react';
import type { Statistics } from '../../../../types';
import { Item } from './components/Item';
import { FormattedMessage } from 'react-intl';

interface Props {
  statistics: Statistics;
}

export const LongestDisruptionsCard: React.FC<Props> = (props) => {
  const { statistics } = props;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-300 p-6 shadow-lg sm:row-span-2 dark:border-gray-700">
      <span className="text-base">
        <FormattedMessage
          id="general.longest_disruptions"
          defaultMessage="Longest Disruptions"
        />
      </span>
      <div className="mt-2.5 flex max-h-40 flex-col gap-y-2.5 overflow-y-scroll sm:max-h-[450px]">
        {statistics.issuesDisruptionLongest.map((issueRef) => (
          <Item key={issueRef.id} issueRef={issueRef} />
        ))}
      </div>
    </div>
  );
};
