import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type React from 'react';
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
      <DeferredStatisticsCard fallback={<TrendCardSkeleton />}>
        <CountTrendCards graphs={statistics.timeScaleChartsIssueCount} />
      </DeferredStatisticsCard>
      <DeferredStatisticsCard fallback={<HeatmapCardSkeleton />}>
        <DisruptionsHeatmap chart={statistics.chartRollingYearHeatmap} />
      </DeferredStatisticsCard>
      <DeferredStatisticsCard
        fallback={<BarChartCardSkeleton barCount={8} heightClassName="h-64" />}
      >
        <LinesIssueCountCard chart={statistics.chartTotalIssueCountByLine} />
      </DeferredStatisticsCard>
      <DeferredStatisticsCard fallback={<LongestDisruptionsCardSkeleton />}>
        <LongestDisruptionsCard
          issueIds={statistics.issueIdsDisruptionLongest}
        />
      </DeferredStatisticsCard>
      <DeferredStatisticsCard
        fallback={<BarChartCardSkeleton barCount={15} heightClassName="h-72" />}
      >
        <StationsIssueCountCard
          chart={statistics.chartTotalIssueCountByStation}
        />
      </DeferredStatisticsCard>
      <DeferredStatisticsCard fallback={<TrendCardSkeleton />}>
        <DurationTrendCards graphs={statistics.timeScaleChartsIssueDuration} />
      </DeferredStatisticsCard>
    </div>
  );
};

interface DeferredStatisticsCardProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

function DeferredStatisticsCard(props: DeferredStatisticsCardProps) {
  const { children, fallback } = props;
  const [shouldRender, setShouldRender] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (shouldRender) {
      return;
    }

    const container = containerRef.current;
    if (container == null || !('IntersectionObserver' in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [shouldRender]);

  return (
    <div className="col-span-6" ref={containerRef}>
      {shouldRender ? (
        <Suspense fallback={fallback}>{children}</Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
