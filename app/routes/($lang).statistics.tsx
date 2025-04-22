import type { Statistics } from '../types';
import { StatisticsGrid } from '../components/StatisticsGrid';
import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';

import type { Route } from './+types/($lang).statistics';
import { assert } from '../util/assert';
import { createIntl } from 'react-intl';

export async function loader({ params }: Route.LoaderArgs) {
  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/statistics.json',
  );
  assert(res.ok, res.statusText);
  const statistics: Statistics = await res.json();
  patchDatesForOngoingIssues(statistics.dates, statistics.issuesOngoing);

  const { lang = 'en-SG' } = params;
  const { default: messages } = await import(`../../lang/${lang}.json`);

  return {
    statistics,
    messages,
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ params, data }) => {
  const { lang = 'en-SG' } = params;

  const intl = createIntl({
    locale: lang,
    messages: data.messages,
  });

  return [
    {
      title: `${intl.formatMessage({
        id: 'general.statistics',
        defaultMessage: 'Statistics',
      })} | mrtdown`,
    },
  ];
};

const StatisticsPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;

  return (
    <div className="flex flex-col">
      <StatisticsGrid statistics={loaderData.statistics} />
    </div>
  );
};

export default StatisticsPage;
