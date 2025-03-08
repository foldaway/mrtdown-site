import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { Overview } from '../types';
import { ComponentOutlook } from '../components/ComponentOutlook';
import { IssueViewer } from '../components/IssueViewer';
import { IssueSkeleton } from '../components/IssueSkeleton';
import { ArrowLeftIcon } from '@heroicons/react/16/solid';
import { ComponentOutlookSkeleton } from '../components/ComponentOutlookSkeleton';

const HomePage: React.FC = () => {
  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () =>
      fetch('https://data.mrtdown.foldaway.space/product/overview.json').then(
        (r) => r.json(),
      ),
  });

  return (
    <div className="flex flex-col gap-y-8">
      {error != null && (
        <span className="text-red-500 text-sm">{error.message}</span>
      )}
      {isLoading && (
        <>
          <IssueSkeleton issueType="disruption" />
          <IssueSkeleton issueType="maintenance" />
          <ComponentOutlookSkeleton />
          <ComponentOutlookSkeleton />
          <ComponentOutlookSkeleton />
        </>
      )}

      {data != null && (
        <>
          {data.issuesOngoing.map((issue) => (
            <IssueViewer key={issue.id} issue={issue} />
          ))}
          {data.issuesOngoing.length === 0 && (
            <h2 className="rounded bg-operational-light px-4 py-2 font-bold text-gray-50 text-lg dark:bg-operational-dark dark:text-gray-100">
              All Systems Operational
            </h2>
          )}
          <div className="flex flex-col gap-y-6">
            {Object.values(data.components).map((entry) => (
              <ComponentOutlook key={entry.component.id} entry={entry} />
            ))}
          </div>
        </>
      )}

      <Link
        className="flex items-center gap-x-2 text-gray-400 text-sm hover:underline dark:text-gray-500"
        to="/history"
      >
        <ArrowLeftIcon className="size-4" /> Incident History
      </Link>
    </div>
  );
};

export const Component = HomePage;
