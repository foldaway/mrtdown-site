import type React from 'react';
import type { Statistics } from '../../types';
import { CountTrendCards } from './components/CountTrendCards';
import { DurationCards } from './components/DurationCards';
import { LongestDisruptionsCard } from './components/LongestDisruptionsCard';
import { ComponentDisruptionsCountCard } from './components/ComponentDisruptionsCountCard';

interface Props {
  statistics: Statistics;
}

export const StatisticsGrid: React.FC<Props> = (props) => {
  const { statistics } = props;

  return (
    <div className="grid grid-cols-1 gap-4 text-gray-800 sm:grid-cols-2 md:grid-cols-3 dark:text-gray-200">
      <CountTrendCards statistics={statistics} />
      <ComponentDisruptionsCountCard statistics={statistics} />
      <LongestDisruptionsCard statistics={statistics} />
      <DurationCards statistics={statistics} />
    </div>
  );
};
