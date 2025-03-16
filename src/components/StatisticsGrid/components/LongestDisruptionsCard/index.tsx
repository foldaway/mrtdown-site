import type React from 'react';
import type { Statistics } from '../../../../types';
import { Item } from './components/Item';

interface Props {
  statistics: Statistics;
}

export const LongestDisruptionsCard: React.FC<Props> = (props) => {
  const { statistics } = props;

  return (
    <div className="flex flex-col rounded-lg overflow-hidden sm:row-span-2 border border-gray-300 p-6 shadow-lg dark:border-gray-700">
      <span className="text-base">Longest Disruptions</span>
      <div className="flex mt-2.5 flex-col max-h-40 sm:max-h-[450px] overflow-y-scroll gap-y-2.5">
        {statistics.issuesDisruptionLongest.map((issueRef) => (
          <Item key={issueRef.id} issueRef={issueRef} />
        ))}
      </div>
    </div>
  );
};
