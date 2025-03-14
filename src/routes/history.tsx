import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/16/solid';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'react';
import { IssuesHistoryPageViewer } from '../components/IssuesHistoryPageViewer';
import { IssueSkeleton } from '../components/IssueSkeleton';
import type { IssuesHistory, IssuesHistoryPage } from '../types';
import classNames from 'classnames';
import { useViewport } from '../hooks/useViewport';
import { useSearchParams } from 'react-router';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface HistoryContentProps {
  pageCount: number;
}

const HistoryContent: React.FC<HistoryContentProps> = (props) => {
  const { pageCount } = props;

  const viewport = useViewport();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(() => {
    const paramPage = searchParams.get('page');
    if (paramPage != null) {
      try {
        return Number.parseInt(paramPage, 10);
      } catch (e) {}
    }
    return pageCount;
  });
  useEffect(() => {
    setSearchParams({ page: page.toString() }, { replace: true });
  }, [page, setSearchParams]);

  useDocumentTitle('Incident History | mrtdown');

  const fetchIssues = (pageNo = 1) =>
    fetch(
      `https://data.mrtdown.foldaway.space/product/issues_history_page_${pageNo}.json`,
    ).then((r) => r.json());

  const { isFetching, isPending, data } = useQuery<IssuesHistoryPage>({
    queryKey: ['issues-history', 'page', page],
    queryFn: () => fetchIssues(page),
  });

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
    const lowestPageIndex = Math.floor(page - maximumPaginationButtonCount / 2);
    if (lowestPageIndex < 0) {
      return Array.from(
        { length: maximumPaginationButtonCount },
        (_, x) => 0 + x,
      );
    }
    const highestPageIndex = Math.ceil(page + maximumPaginationButtonCount / 2);
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
  }, [page, pageCount, maximumPaginationButtonCount]);

  return (
    <div className="flex flex-col gap-y-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex grow items-center justify-center gap-x-3">
          <button
            type="button"
            className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
            onClick={() => setPage((old) => Math.max(old - 1, 0))}
            disabled={page === 1}
          >
            <ArrowLeftIcon className="size-4" />
          </button>

          <div className="flex w-48 flex-col items-center">
            {data != null && (
              <span className="font-bold text-base text-gray-800 dark:text-gray-100">
                {new Intl.DateTimeFormat(undefined, {
                  year: 'numeric',
                  month: 'long',
                }).formatRange(
                  DateTime.fromISO(data.startAt).toJSDate(),
                  DateTime.fromISO(data.endAt).toJSDate(),
                )}
              </span>
            )}
          </div>

          <button
            type="button"
            className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
            onClick={() => {
              if (page < pageCount) {
                setPage((old) => old + 1);
              }
            }}
            disabled={page >= pageCount}
          >
            <ArrowRightIcon className="size-4" />
          </button>
        </div>
      </div>

      {data != null && <IssuesHistoryPageViewer page={data} />}

      {(isFetching || isPending) && <IssueSkeleton />}

      <div className="flex items-center justify-center">
        <button
          type="button"
          className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
          onClick={() => setPage((old) => Math.max(old - 1, 0))}
          disabled={page === 1}
        >
          <ArrowLeftIcon className="size-4" />
        </button>

        {pageNumbers.map((i) => (
          <button
            key={i}
            type="button"
            className={classNames(
              'size-8 rounded text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700',
              {
                'bg-gray-200 font-bold dark:bg-gray-700': i + 1 === page,
              },
            )}
            onClick={() => setPage(i + 1)}
          >
            {i + 1}
          </button>
        ))}

        <button
          type="button"
          className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
          onClick={() => {
            if (page < pageCount) {
              setPage((old) => old + 1);
            }
          }}
          disabled={page >= pageCount}
        >
          <ArrowRightIcon className="size-4" />
        </button>
      </div>
    </div>
  );
};

const HistoryPage: React.FC = () => {
  const { isLoading, data } = useQuery<IssuesHistory>({
    queryKey: ['issues-history'],
    queryFn: () =>
      fetch(
        'https://data.mrtdown.foldaway.space/product/issues_history.json',
      ).then((r) => r.json()),
  });

  return (
    <div className="flex flex-col gap-y-3">
      {isLoading && (
        <>
          <IssueSkeleton issueType="disruption" />
          <IssueSkeleton issueType="maintenance" />
          <IssueSkeleton issueType="infra" />
        </>
      )}

      {data != null && <HistoryContent pageCount={data.pageCount} />}
    </div>
  );
};

export const Component = HistoryPage;
