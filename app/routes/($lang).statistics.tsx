import { createIntl, FormattedMessage } from 'react-intl';
import { getAnalytics } from '~/client';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { StatisticsGrid } from '../components/StatisticsGrid';
import { assert } from '../util/assert';
import type { Route } from './+types/($lang).statistics';

export async function loader({ params }: Route.LoaderArgs) {
  const rootUrl = process.env.ROOT_URL;

  const { data, error } = await getAnalytics({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
  });
  if (error != null) {
    console.error('Error fetching statistics:', error);
    throw new Response('Failed to fetch statistics', {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
  assert(data != null);

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
    data: data.data,
    included: data.included,
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
    <IncludedEntitiesContext.Provider value={loaderData.included}>
      <div className="flex flex-col space-y-8">
        <header className="space-y-4 text-center">
          <h1 className="font-bold text-3xl text-gray-900 leading-tight sm:text-4xl dark:text-gray-100">
            <FormattedMessage
              id="general.statistics"
              defaultMessage="Statistics"
            />
          </h1>
          <p className="mx-auto max-w-2xl text-gray-600 text-lg leading-relaxed dark:text-gray-400">
            <FormattedMessage
              id="site.statistics.subtitle"
              defaultMessage="Historical performance data and analytics for Singapore's MRT and LRT network"
            />
          </p>
        </header>
        <StatisticsGrid statistics={loaderData.data} />
      </div>
    </IncludedEntitiesContext.Provider>
  );
};

export default StatisticsPage;
