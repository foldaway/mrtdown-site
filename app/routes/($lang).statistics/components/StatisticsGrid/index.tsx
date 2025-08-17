import type React from 'react';
import type { SystemAnalytics } from '~/client';
import { CountTrendCards } from './components/CountTrendCards';
import { DurationTrendCards } from './components/DurationTrendCards';
import { LinesIssueCountCard } from './components/LinesIssueCountCard';
import { LongestDisruptionsCard } from './components/LongestDisruptionsCard';
import { StationsIssueCountCard } from './components/StationsIssueCountCard';

interface Props {
  statistics: SystemAnalytics;
}

export const StatisticsGrid: React.FC<Props> = (props) => {
  const { statistics } = props;

  return (
    <div className="grid grid-cols-1 gap-4 text-gray-800 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 dark:text-gray-200">
      <CountTrendCards graphs={statistics.timeScaleChartsIssueCount} />
      <LinesIssueCountCard chart={statistics.chartTotalIssueCountByLine} />
      <LongestDisruptionsCard issueIds={statistics.issueIdsDisruptionLongest} />
      <StationsIssueCountCard
        chart={statistics.chartTotalIssueCountByStation}
      />
      <DurationTrendCards graphs={statistics.timeScaleChartsIssueDuration} />
    </div>
  );
};
