import type React from 'react';

export function StatisticsGridSkeleton() {
  return (
    <div
      aria-busy="true"
      className="grid grid-cols-1 gap-3 text-gray-800 sm:gap-4 md:grid-cols-12 dark:text-gray-200"
    >
      <span className="sr-only">Loading statistics</span>
      <TrendCardSkeleton />
      <TrendCardSkeleton />
      <HeatmapCardSkeleton />
      <BarChartCardSkeleton barCount={8} heightClassName="h-64" />
      <LongestDisruptionsCardSkeleton />
      <BarChartCardSkeleton barCount={15} heightClassName="h-72" />
    </div>
  );
}

function CardSkeleton(props: React.PropsWithChildren<{ className?: string }>) {
  const { children, className = 'md:col-span-12' } = props;

  return (
    <div
      className={`${className} overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800`}
    >
      <div className="border-gray-200 border-b px-4 py-2.5 sm:px-5 sm:py-3 dark:border-gray-700">
        <div className="h-5 w-52 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="flex animate-pulse flex-col px-4 py-3 sm:px-5 sm:py-4">
        {children}
      </div>
    </div>
  );
}

export function TrendCardSkeleton() {
  return (
    <CardSkeleton className="md:col-span-6">
      <div className="h-8 w-40 rounded-md bg-gray-200 dark:bg-gray-700" />
      <div className="mt-1 h-3 w-28 rounded-sm bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 flex h-40 items-end gap-x-3 border-gray-100 border-b px-1 pb-4 sm:h-44 dark:border-gray-700">
        {TREND_POINT_IDS.map((pointId, index) => (
          <div
            className="flex flex-1 flex-col items-center justify-end gap-y-2"
            key={pointId}
          >
            <div
              className="w-full rounded-t-sm bg-gray-200 dark:bg-gray-700"
              style={{ height: `${TREND_BAR_HEIGHTS[index]}%` }}
            />
            <div className="h-2 w-full rounded-sm bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex self-start overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
        {TIME_SCALE_IDS.map((scaleId, index) => (
          <div
            className="h-8 w-16 border-gray-200 border-l first:border-l-0 dark:border-gray-700"
            key={scaleId}
          >
            <div
              className={
                index === 0
                  ? 'h-full bg-blue-50 dark:bg-blue-900/40'
                  : 'h-full bg-gray-50 dark:bg-gray-800'
              }
            />
          </div>
        ))}
      </div>
    </CardSkeleton>
  );
}

export function HeatmapCardSkeleton() {
  return (
    <CardSkeleton>
      <div className="overflow-hidden pb-2">
        <div className="mb-2 ml-8 flex gap-x-9">
          {HEATMAP_MONTH_IDS.map((monthId) => (
            <div
              className="h-3 w-6 rounded-sm bg-gray-100 dark:bg-gray-800"
              key={monthId}
            />
          ))}
        </div>
        <div className="flex gap-x-2">
          <div className="flex flex-col gap-y-1 py-0.5">
            {HEATMAP_DAY_IDS.map((dayId) => (
              <div
                className="h-3 w-5 rounded-sm bg-gray-100 dark:bg-gray-800"
                key={dayId}
              />
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {HEATMAP_CELL_IDS.map((cellId, index) => (
              <div
                className={getHeatmapCellSkeletonClassName(index)}
                key={cellId}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <div className="h-3 w-6 rounded-sm bg-gray-100 dark:bg-gray-800" />
        {HEATMAP_LEGEND_IDS.map((legendId) => (
          <div
            className="size-3 rounded-[2px] bg-gray-200 dark:bg-gray-700"
            key={legendId}
          />
        ))}
        <div className="h-3 w-7 rounded-sm bg-gray-100 dark:bg-gray-800" />
      </div>
    </CardSkeleton>
  );
}

interface BarChartCardSkeletonProps {
  barCount: number;
  heightClassName: string;
}

export function BarChartCardSkeleton(props: BarChartCardSkeletonProps) {
  const { barCount, heightClassName } = props;
  const barIds = barCount === 15 ? STATION_BAR_IDS : LINE_BAR_IDS;

  return (
    <CardSkeleton>
      <div
        className={`flex ${heightClassName} items-end gap-x-2 border-gray-100 border-b px-1 pb-8 dark:border-gray-800`}
      >
        {barIds.map((barId, index) => (
          <div
            className="flex flex-1 flex-col items-center justify-end"
            key={barId}
          >
            <div
              className="w-full rounded-t-sm bg-gray-200 dark:bg-gray-700"
              style={{
                height: `${BAR_HEIGHTS[index % BAR_HEIGHTS.length]}%`,
              }}
            />
            <div className="mt-3 h-2 w-full rounded-sm bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </CardSkeleton>
  );
}

export function LongestDisruptionsCardSkeleton() {
  return (
    <CardSkeleton>
      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center gap-x-3">
          <div className="size-10 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 rounded-sm bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-28 rounded-sm bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-6 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded-sm bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-11/12 rounded-sm bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-3/4 rounded-sm bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
      <div className="mt-3 h-9 w-32 self-center rounded-xl bg-gray-200 dark:bg-gray-700" />
    </CardSkeleton>
  );
}

function getHeatmapCellSkeletonClassName(index: number) {
  const intensityClassNames = [
    'bg-gray-100 dark:bg-gray-700/70',
    'bg-gray-200 dark:bg-gray-700',
    'bg-gray-300 dark:bg-gray-600',
  ];
  return `size-3 rounded-[2px] ${
    intensityClassNames[index % intensityClassNames.length]
  }`;
}

const TREND_POINT_IDS = Array.from(
  { length: 18 },
  (_, index) => `trend-point-${index}`,
);
const TREND_BAR_HEIGHTS = [
  28, 44, 34, 58, 42, 72, 50, 66, 38, 54, 80, 62, 46, 68, 56, 74, 48, 60,
];
const TIME_SCALE_IDS = ['month', 'quarter', 'year'];
const HEATMAP_MONTH_IDS = Array.from(
  { length: 12 },
  (_, index) => `heatmap-month-${index}`,
);
const HEATMAP_DAY_IDS = Array.from(
  { length: 7 },
  (_, index) => `heatmap-day-${index}`,
);
const HEATMAP_CELL_IDS = Array.from(
  { length: 7 * 53 },
  (_, index) => `heatmap-cell-${index}`,
);
const HEATMAP_LEGEND_IDS = Array.from(
  { length: 5 },
  (_, index) => `heatmap-legend-${index}`,
);
const LINE_BAR_IDS = Array.from(
  { length: 8 },
  (_, index) => `line-bar-${index}`,
);
const STATION_BAR_IDS = Array.from(
  { length: 15 },
  (_, index) => `station-bar-${index}`,
);
const BAR_HEIGHTS = [
  42, 66, 34, 82, 58, 74, 48, 62, 90, 52, 70, 38, 76, 46, 64,
];
