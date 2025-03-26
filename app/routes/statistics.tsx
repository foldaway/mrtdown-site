import type { Statistics } from '../types';
import { StatisticsGrid } from '../components/StatisticsGrid';
import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';
import type { MetaFunction } from 'react-router';

import type { Route } from './+types/statistics';
import { assert } from '../util/assert';

export async function loader() {
  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/statistics.json',
  );
  assert(res.ok, res.statusText);
  const statistics: Statistics = await res.json();
  patchDatesForOngoingIssues(statistics.dates, statistics.issuesOngoing);
  return statistics;
}

export const meta: MetaFunction = () => {
  return [
    {
      title: 'Statistics | mrtdown',
    },
  ];
};

const StatisticsPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;

  return (
    <div className="flex flex-col">
      <StatisticsGrid statistics={loaderData} />
    </div>
  );
};

export default StatisticsPage;
