import type React from 'react';
import type { Statistics } from '~/client';
import { ComponentDisruptionsCountCard } from './components/ComponentDisruptionsCountCard';
import { CountTrendCards } from './components/CountTrendCards';
import { DurationTrendCards } from './components/DurationTrendCards';
import { LongestDisruptionsCard } from './components/LongestDisruptionsCard';
import { StationsIssueCountCard } from './components/StationsIssueCountCard';

interface Props {
  statistics: Statistics;
}

export const StatisticsGrid: React.FC<Props> = (props) => {
  const { statistics } = props;

  return (
    <div className="grid grid-cols-1 gap-4 text-gray-800 sm:grid-cols-2 md:grid-cols-3 dark:text-gray-200">
      <CountTrendCards graphs={statistics.timeScaleChartsIssueCount} />
      <ComponentDisruptionsCountCard
        chart={statistics.chartTotalIssueCountByLine}
      />
      <LongestDisruptionsCard issueIds={statistics.issueIdsDisruptionLongest} />
      <DurationTrendCards graphs={statistics.timeScaleChartsIssueDuration} />
      <StationsIssueCountCard
        chart={statistics.chartTotalIssueCountByStation}
      />
    </div>
  );
};
