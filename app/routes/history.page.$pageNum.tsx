import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/16/solid';
import classNames from 'classnames';
import { DateTime, Interval } from 'luxon';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { IssuesHistoryPageViewer } from '../components/IssuesHistoryPageViewer';
import { useViewport } from '../hooks/useViewport';
import type { IssuesHistory, IssuesHistoryPage } from '../types';

import { useHydrated } from '../hooks/useHydrated';
import { assert } from '../util/assert';
import type { Route } from './+types/history.page.$pageNum';

export async function loader({ params }: Route.LoaderArgs) {
  const { pageNum } = params;

  const pageNumber = Number.parseInt(pageNum, 10);
  assert(!Number.isNaN(pageNumber), 'Invalid page number');

  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/issues_history.json',
  );
  const history: IssuesHistory = await res.json();
  const page: IssuesHistoryPage = await fetch(
    `https://data.mrtdown.foldaway.space/product/issues_history_page_${pageNumber}.json`,
  ).then((r) => r.json());
  return { history, page };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ params }) => {
  return [
    {
      title: `Incident History - Page ${params.pageNum} | mrtdown`,
    },
  ];
};

const HistoryPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData, params } = props;
  const { pageNum } = params;
  const pageNumber = Number.parseInt(pageNum, 10);
  const { history, page } = loaderData;
  const { pageCount } = history;

  const viewport = useViewport();

  const maximumPaginationButtonCount = useMemo(
    () => (viewport === 'xs' ? 11 : 21),
    [viewport],
  );

  const pageNumbers = useMemo(() => {
    if (pageCount < maximumPaginationButtonCount) {
      return Array.from({ length: pageCount }, (_, x) =>
        Math.round(lowestPageIndex + x),
      );
    }
    const lowestPageIndex = Math.floor(
      pageNumber - maximumPaginationButtonCount / 2,
    );
    if (lowestPageIndex < 0) {
      return Array.from(
        { length: maximumPaginationButtonCount },
        (_, x) => 0 + x,
      );
    }
    const highestPageIndex = Math.ceil(
      pageNumber + maximumPaginationButtonCount / 2,
    );
    if (highestPageIndex > pageCount) {
      return Array.from(
        { length: maximumPaginationButtonCount },
        (_, x) => pageCount - (maximumPaginationButtonCount - x),
      );
    }
    return Array.from(
      { length: maximumPaginationButtonCount },
      (_, x) => lowestPageIndex + x,
    );
  }, [pageNumber, pageCount, maximumPaginationButtonCount]);

  const interval = useMemo(() => {
    return Interval.fromDateTimes(
      DateTime.fromISO(page.startAt),
      DateTime.fromISO(page.endAt),
    );
  }, [page]);

  const isHydrated = useHydrated();

  return (
    <div className="flex flex-col gap-y-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex grow items-center justify-center gap-x-3">
          <button
            type="button"
            className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
            disabled={pageNumber === 1}
          >
            <Link to={`/history/page/${pageNumber - 1}`}>
              <ArrowLeftIcon className="size-4" />
            </Link>
          </button>

          <div className="flex min-w-48 flex-col items-center">
            {interval != null && (
              <span className="font-bold text-base text-gray-800 dark:text-gray-100">
                {isHydrated
                  ? interval.toLocaleString({
                      year: 'numeric',
                      month: 'long',
                    })
                  : interval.toISO()}
              </span>
            )}
          </div>

          <button
            type="button"
            className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
            disabled={pageNumber >= pageCount}
          >
            <Link to={`/history/page/${pageNumber + 1}`}>
              <ArrowRightIcon className="size-4" />
            </Link>
          </button>
        </div>
      </div>

      <IssuesHistoryPageViewer page={page} />

      <div className="flex items-center justify-center">
        <button
          type="button"
          className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
          disabled={pageNumber === 1}
        >
          <Link to={`/history/page/${pageNumber - 1}`}>
            <ArrowLeftIcon className="size-4" />
          </Link>
        </button>

        {pageNumbers.map((i) => (
          <button
            key={i}
            type="button"
            className={classNames(
              'size-8 rounded text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700',
              {
                'bg-gray-200 font-bold dark:bg-gray-700': i + 1 === pageNumber,
              },
            )}
          >
            <Link to={`/history/page/${i + 1}`}>{i + 1}</Link>
          </button>
        ))}

        <button
          type="button"
          className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
          disabled={pageNumber >= pageCount}
        >
          <Link to={`/history/page/${pageNumber + 1}`}>
            <ArrowRightIcon className="size-4" />
          </Link>
        </button>
      </div>
    </div>
  );
};

export default HistoryPage;
