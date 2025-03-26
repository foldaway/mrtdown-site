import { useQuery } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Statistics } from '../types';
import { StatisticsGrid } from '../components/StatisticsGrid';
import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';
import { IssueSkeleton } from '../components/IssueSkeleton';

const StatisticsPage: React.FC = () => {
  useDocumentTitle('Statistics | mrtdown');

  const { data, isLoading, error } = useQuery<Statistics>({
    queryKey: ['statistics'],
    queryFn: async () => {
      const response: Statistics = await fetch(
        'https://data.mrtdown.foldaway.space/product/statistics.json',
      ).then((r) => r.json());
      patchDatesForOngoingIssues(response.dates, response.issuesOngoing);
      return response;
    },
  });

  return (
    <div className="flex flex-col">
      {isLoading && <IssueSkeleton />}
      {error != null && (
        <span className="text-red-500 text-sm">{error.message}</span>
      )}
      {data != null && <StatisticsGrid statistics={data} />}
    </div>
  );
};

export default StatisticsPage;
