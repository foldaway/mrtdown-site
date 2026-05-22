import classNames from 'classnames';
import { HomeSkeletonDateBars } from './components/HomeSkeletonDateBars';

interface HomeLineSummariesSkeletonProps {
  dateKeys?: string[];
  lineIds: string[];
}

export function HomeLineSummariesSkeleton(
  props: HomeLineSummariesSkeletonProps,
) {
  const { dateKeys, lineIds } = props;
  const skeletonLineIds =
    lineIds.length > 0 ? lineIds : ['line-summary-skeleton'];
  const dateBarCount = dateKeys?.length;

  return (
    <div
      aria-busy="true"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <span className="sr-only">Loading service status</span>
      <div className="flex flex-col gap-y-4 px-2 py-2 sm:gap-y-6 sm:px-3 sm:py-4">
        {skeletonLineIds.map((lineId) => (
          <div
            className="flex animate-pulse flex-col rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800"
            key={lineId}
          >
            <div className="mb-1.5 flex items-center">
              <div className="h-5 w-12 rounded-sm bg-gray-300 dark:bg-gray-700" />
              <div className="ms-1.5 h-4 w-36 rounded-sm bg-gray-300 dark:bg-gray-700" />
              <div className="ms-auto h-4 w-20 rounded-sm bg-gray-300 dark:bg-gray-700" />
            </div>

            <div
              className={classNames(
                'grid items-center gap-x-1 sm:gap-x-0.5 lg:gap-x-px',
                dateBarCount == null &&
                  'grid-cols-30 sm:grid-cols-60 lg:grid-cols-90',
              )}
              style={
                dateBarCount == null
                  ? undefined
                  : {
                      gridTemplateColumns: `repeat(${dateBarCount}, minmax(0, 1fr))`,
                    }
              }
            >
              <HomeSkeletonDateBars dateKeys={dateKeys} />
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-x-1">
              <div className="h-3 w-20 rounded-sm bg-gray-300 dark:bg-gray-700" />
              <div className="h-3 w-24 rounded-sm bg-gray-300 dark:bg-gray-700" />
              <div className="h-3 w-14 rounded-sm bg-gray-300 dark:bg-gray-700" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
