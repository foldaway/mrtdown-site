import { lazy } from 'react';
import { DeferredViewportWidget } from '~/components/DeferredViewportWidget';
import type { SystemAnalytics } from '~/util/db.queries';
import {
  BarChartCardSkeleton,
  HeatmapCardSkeleton,
  LongestDisruptionsCardSkeleton,
  TrendCardSkeleton,
} from './components/StatisticsGridSkeleton';

const CountTrendCards = lazy(() =>
  import('./components/CountTrendCards').then((module) => ({
    default: module.CountTrendCards,
  })),
);
const DisruptionsHeatmap = lazy(() =>
  import('./components/DisruptionsHeatmap').then((module) => ({
    default: module.DisruptionsHeatmap,
  })),
);
const DurationTrendCards = lazy(() =>
  import('./components/DurationTrendCards').then((module) => ({
    default: module.DurationTrendCards,
  })),
);
const LinesIssueCountCard = lazy(() =>
  import('./components/LinesIssueCountCard').then((module) => ({
    default: module.LinesIssueCountCard,
  })),
);
const LongestDisruptionsCard = lazy(() =>
  import('./components/LongestDisruptionsCard').then((module) => ({
    default: module.LongestDisruptionsCard,
  })),
);
const StationsIssueCountCard = lazy(() =>
  import('./components/StationsIssueCountCard').then((module) => ({
    default: module.StationsIssueCountCard,
  })),
);

interface Props {
  statistics: SystemAnalytics;
}

export const StatisticsGrid: React.FC<Props> = (props) => {
  const { statistics } = props;

  return (
    <div className="grid grid-cols-1 gap-4 text-gray-800 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 dark:text-gray-200">
      <DeferredViewportWidget
        className="col-span-6"
        fallback={<TrendCardSkeleton />}
      >
        <CountTrendCards graphs={statistics.timeScaleChartsIssueCount} />
      </DeferredViewportWidget>
      <DeferredViewportWidget
        className="col-span-6"
        fallback={<HeatmapCardSkeleton />}
      >
        <DisruptionsHeatmap chart={statistics.chartRollingYearHeatmap} />
      </DeferredViewportWidget>
      <DeferredViewportWidget
        className="col-span-6"
        fallback={<BarChartCardSkeleton barCount={8} heightClassName="h-64" />}
      >
        <LinesIssueCountCard chart={statistics.chartTotalIssueCountByLine} />
      </DeferredViewportWidget>
      <DeferredViewportWidget
        className="col-span-6"
        fallback={<LongestDisruptionsCardSkeleton />}
      >
        <LongestDisruptionsCard
          issueIds={statistics.issueIdsDisruptionLongest}
        />
      </DeferredViewportWidget>
      <DeferredViewportWidget
        className="col-span-6"
        fallback={<BarChartCardSkeleton barCount={15} heightClassName="h-72" />}
      >
        <StationsIssueCountCard
          chart={statistics.chartTotalIssueCountByStation}
        />
      </DeferredViewportWidget>
      <DeferredViewportWidget
        className="col-span-6"
        fallback={<TrendCardSkeleton />}
      >
        <DurationTrendCards graphs={statistics.timeScaleChartsIssueDuration} />
      </DeferredViewportWidget>
    </div>
  );
};
