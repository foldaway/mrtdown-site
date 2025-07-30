import { createIntl, FormattedMessage } from 'react-intl';
import { patchStatisticsForOngoingIssues } from '~/helpers/patchStatisticsForOngoingIssues';
import { StatisticsGrid } from '../components/StatisticsGrid';
import type { Statistics } from '../types';
import { assert } from '../util/assert';
import type { Route } from './+types/($lang).statistics';

export async function loader({ params }: Route.LoaderArgs) {
  const rootUrl = process.env.ROOT_URL;

  const res = await fetch('https://data.mrtdown.org/product/statistics.json');
  assert(res.ok, res.statusText);
  const statistics: Statistics = await res.json();

  patchStatisticsForOngoingIssues(statistics);

  const { lang = 'en-SG' } = params;
  const { default: messages } = await import(`../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const title = intl.formatMessage({
    id: 'general.statistics',
    defaultMessage: 'Statistics',
  });

  return {
    statistics,
    title,
    rootUrl,
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ data, location }) => {
  const { title, rootUrl } = data;

  const ogUrl = new URL(location.pathname, rootUrl).toString();
  const ogImage = new URL('/og_image.png', rootUrl).toString();

  return [
    {
      title,
    },
    {
      property: 'og:title',
      content: title,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      property: 'og:url',
      content: ogUrl,
    },
    {
      property: 'og:image',
      content: ogImage,
    },
  ];
};

const StatisticsPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">
        <FormattedMessage id="general.statistics" defaultMessage="Statistics" />
      </h1>
      <StatisticsGrid statistics={loaderData.statistics} />
    </div>
  );
};

export default StatisticsPage;
