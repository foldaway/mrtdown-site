import { useQuery } from '@tanstack/react-query';
import { IssueSkeleton } from '../components/IssueSkeleton';
import type { IssuesHistory, IssuesHistoryPage } from '../types';
import { useState } from 'react';
import { IssueViewer } from '../components/IssueViewer';
import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/16/solid';

interface HistoryContentProps {
  pageCount: number;
}

const HistoryContent: React.FC<HistoryContentProps> = (props) => {
  const { pageCount } = props;

  const [page, setPage] = useState(1);

  const fetchIssues = (pageNo = 1) =>
    fetch(
      `https://data.mrtdown.foldaway.space/product/issues_history_page_${pageNo}.json`,
    ).then((r) => r.json());

  const { isFetching, isPending, data } = useQuery<IssuesHistoryPage>({
    queryKey: ['issues-history', 'page', page],
    queryFn: () => fetchIssues(page),
  });

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
          onClick={() => setPage((old) => Math.max(old - 1, 0))}
          disabled={page === 1}
        >
          <ArrowLeftIcon className="size-4" />
        </button>

        <div className="flex flex-col items-center">
          <h1 className="font-bold text-gray-800 text-lg dark:text-gray-100">
            Incident History
          </h1>
          <span className="text-gray-500 text-xs dark:text-gray-400">
            Page {page} of {pageCount}
          </span>
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

      {data?.issues.map((issue) => (
        <IssueViewer key={issue.id} issue={issue} />
      ))}

      {(isFetching || isPending) && <IssueSkeleton />}

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded p-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-700"
          onClick={() => setPage((old) => Math.max(old - 1, 0))}
          disabled={page === 1}
        >
          <ArrowLeftIcon className="size-4" />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-gray-500 text-xs dark:text-gray-400">
            Page {page} of {pageCount}
          </span>
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
