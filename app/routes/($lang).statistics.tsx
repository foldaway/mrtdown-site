import type { Statistics } from '../types';
import { StatisticsGrid } from '../components/StatisticsGrid';
import { patchDatesForOngoingIssues } from '../helpers/patchDatesForOngoingIssues';

import type { Route } from './+types/($lang).statistics';
import { assert } from '../util/assert';
import { createIntl } from 'react-intl';
import type { SitemapFunction } from 'remix-sitemap';
import { LANGUAGES_NON_DEFAULT } from '~/constants';

export async function loader({ params, context }: Route.LoaderArgs) {
  const rootUrl = context.cloudflare.env.CF_PAGES_URL;

  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/statistics.json',
  );
  assert(res.ok, res.statusText);
  const statistics: Statistics = await res.json();
  patchDatesForOngoingIssues(statistics.dates, statistics.issuesOngoing);

  const { lang = 'en-SG' } = params;
  const { default: messages } = await import(`../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const title = `${intl.formatMessage({
    id: 'general.statistics',
    defaultMessage: 'Statistics',
  })} | mrtdown`;

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

export const sitemap: SitemapFunction = async ({ config }) => {
  return [
    {
      loc: '/statistics',
      alternateRefs: LANGUAGES_NON_DEFAULT.map((lang) => {
        return {
          href: new URL(`/${lang}`, config.siteUrl).toString(),
          hreflang: lang,
        };
      }),
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
