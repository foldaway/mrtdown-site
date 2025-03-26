import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { ComponentOutlook } from '../components/ComponentOutlook';
import { ComponentOutlookSkeleton } from '../components/ComponentOutlookSkeleton';
import { IssueSkeleton } from '../components/IssueSkeleton';
import { IssueViewer } from '../components/IssueViewer';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useViewport } from '../hooks/useViewport';
import type { Overview } from '../types';
import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';
import { computeComponentBreakdown } from '../components/ComponentOutlook/helpers/computeComponentBreakdowns';

const HomePage: React.FC = () => {
  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: async () => {
      const response: Overview = await fetch(
        'https://data.mrtdown.foldaway.space/product/overview.json',
      ).then((r) => r.json());
      patchDatesForOngoingIssues(response.dates, response.issuesOngoing);
      return response;
    },
  });

  useDocumentTitle('mrtdown');

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

  const componentBreakdowns = useMemo(() => {
    if (data == null) {
      return [];
    }
    return computeComponentBreakdown(data);
  }, [data]);

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
            {componentBreakdowns.map((componentBreakdown) => (
              <ComponentOutlook
                key={componentBreakdown.component.id}
                breakdown={componentBreakdown}
                dateTimes={dateTimes}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
