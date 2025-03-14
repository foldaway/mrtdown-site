import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { ComponentOutlook } from '../components/ComponentOutlook';
import { ComponentOutlookSkeleton } from '../components/ComponentOutlookSkeleton';
import { IssueSkeleton } from '../components/IssueSkeleton';
import { IssueViewer } from '../components/IssueViewer';
import { useViewport } from '../hooks/useViewport';
import type { Overview } from '../types';

const HomePage: React.FC = () => {
  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () =>
      fetch('https://data.mrtdown.foldaway.space/product/overview.json').then(
        (r) => r.json(),
      ),
  });

  const viewport = useViewport();
  const dateCount = useMemo<number>(() => {
    switch (viewport) {
      case 'xs': {
        return 30;
      }
      case 'sm':
      case 'md': {
        return 60;
      }
      default: {
        return 90;
      }
    }
  }, [viewport]);

  const dateTimes = useMemo(() => {
    const dateRangeEnd = DateTime.now();
    const results: DateTime[] = [];
    for (let i = 0; i < dateCount; i++) {
      results.unshift(dateRangeEnd.minus({ days: i }));
    }
    return results;
  }, [dateCount]);

  return (
    <div className="flex flex-col">
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
        <div className="">
          {data.issuesOngoing.map((issue) => (
            <IssueViewer key={issue.id} issue={issue} />
          ))}
          {data.issuesOngoing.length === 0 && (
            <h2 className="rounded bg-operational-light px-4 py-2 font-bold text-gray-50 text-lg dark:bg-operational-dark dark:text-gray-100">
              All Systems Operational
            </h2>
          )}

          <div className="mt-8 flex flex-col gap-y-6">
            {Object.values(data.components).map((entry) => (
              <ComponentOutlook
                key={entry.component.id}
                entry={entry}
                dateTimes={dateTimes}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const Component = HomePage;
