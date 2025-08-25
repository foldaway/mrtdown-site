import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { useMemo } from 'react';
import { createIntl, FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { getOverview } from '~/client';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { assert } from '../../util/assert';
import type { Route } from './+types/route';
import { CurrentAdvisoriesSection } from './components/CurrentAdvisoriesSection';
import { LineItem } from './components/LineItem';

export async function loader({ params }: Route.LoaderArgs) {
  const { lang = 'en-SG' } = params;

  const { default: messages } = await import(`../../../lang/${lang}.json`);
  const intl = createIntl({
    locale: lang,
    messages,
  });

  const { data, error } = await getOverview({
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

  const title = intl.formatMessage({
    id: 'general.home_page_title',
    defaultMessage: 'Is the MRT Down? Train Disruption Status in Singapore',
  });

  const rootUrl = process.env.ROOT_URL;

  const description = intl.formatMessage({
    id: 'general.home_page_description',
    defaultMessage:
      'See if the MRT is down right now. Get live updates, maintenance alerts, and crowd-sourced reports from fellow commuters on mrtdown.',
  });

  return {
    overview: data.data,
    included: data.included,
    rootUrl,
    title,
    description,
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ data, location }) => {
  const { rootUrl, title, description } = data;

  const ogUrl = new URL(location.pathname, rootUrl).toString();
  const ogImage = new URL('/og_image.png', rootUrl).toString();

  return [
    {
      title,
    },
    {
      name: 'description',
      content: description,
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
    {
      property: 'og:site_name',
      content: 'mrtdown',
    },
    {
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'mrtdown',
        url: rootUrl,
      },
    },
  ];
};

const HomePage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { overview, included } = loaderData;
  const { lines, issues } = included;

  const intl = useIntl();

  const issuesOngoing = useMemo(() => {
    return overview.issueOngoingIds.map((issueId) => issues[issueId]);
  }, [overview.issueOngoingIds, issues]);

  const lineOperationalCount = useMemo(() => {
    return overview.lineSummaries.filter((line) => line.status === 'normal')
      .length;
  }, [overview.lineSummaries]);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col space-y-8">
        <header className="space-y-4 text-center">
          <h1 className="font-bold text-3xl text-gray-900 leading-tight sm:text-4xl dark:text-gray-100">
            <FormattedMessage
              id="site.landing.title"
              defaultMessage="Singapore MRT & LRT Service Status"
            />
          </h1>
          <p className="mx-auto max-w-2xl text-gray-600 text-lg leading-relaxed dark:text-gray-400">
            <FormattedMessage
              id="site.landing.subtitle"
              defaultMessage="Real-time service updates and current disruptions"
            />
          </p>
        </header>

        <CurrentAdvisoriesSection
          issuesOngoing={issuesOngoing}
          lineOperationalCount={lineOperationalCount}
        />

        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 text-center shadow-sm dark:border-gray-700 dark:from-gray-800 dark:to-gray-900">
          <p className="mb-4 text-base text-gray-600 dark:text-gray-300">
            Need more details about service performance and recent incidents?
          </p>
          <Link
            to={buildLocaleAwareLink('/status', intl.locale)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-medium text-sm text-white transition-all duration-200 hover:scale-105 hover:bg-blue-700 hover:shadow-lg dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            <FormattedMessage
              id="general.view_detailed_status"
              defaultMessage="View Detailed Status & Performance"
            />
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {overview.lineSummaries.map((lineSummary, index) => (
              <div
                key={lineSummary.lineId}
                className={`
                  ${index !== overview.lineSummaries.length - 1 ? 'border-gray-200 border-b dark:border-gray-700' : ''} ${index % 2 === 0 ? 'sm:border-gray-200 sm:border-r sm:dark:border-gray-700' : ''} ${index >= overview.lineSummaries.length - 2 ? 'sm:border-b-0' : ''} `.trim()}
              >
                <LineItem
                  line={lines[lineSummary.lineId]}
                  status={lineSummary.status}
                  issueIdsOngoing={lineSummary.issueIdsOngoing}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
          <h3 className="mb-4 text-center font-semibold text-gray-700 text-sm dark:text-gray-300">
            Service Status Legend
          </h3>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
            <div className="inline-flex items-center gap-x-2">
              <div className="size-3 rounded-full bg-operational-light shadow-sm dark:bg-operational-dark" />
              <span className="font-medium text-gray-600 text-sm dark:text-gray-400">
                <FormattedMessage
                  id="status.operational"
                  defaultMessage="Operational"
                />
              </span>
            </div>
            <div className="inline-flex items-center gap-x-2">
              <div className="size-3 rounded-full bg-disruption-light shadow-sm dark:bg-disruption-dark" />
              <span className="font-medium text-gray-600 text-sm dark:text-gray-400">
                <FormattedMessage
                  id="general.disruption"
                  defaultMessage="Disruption"
                />
              </span>
            </div>
            <div className="inline-flex items-center gap-x-2">
              <div className="size-3 rounded-full bg-maintenance-light shadow-sm dark:bg-maintenance-dark" />
              <span className="font-medium text-gray-600 text-sm dark:text-gray-400">
                <FormattedMessage
                  id="general.maintenance"
                  defaultMessage="Maintenance"
                />
              </span>
            </div>
            <div className="inline-flex items-center gap-x-2">
              <div className="size-3 rounded-full bg-infra-light shadow-sm dark:bg-infra-dark" />
              <span className="font-medium text-gray-600 text-sm dark:text-gray-400">
                <FormattedMessage
                  id="general.infrastructure"
                  defaultMessage="Infrastructure"
                />
              </span>
            </div>
            <div className="inline-flex items-center gap-x-2">
              <div className="size-3 rounded-full bg-gray-400 shadow-sm dark:bg-gray-600" />
              <span className="font-medium text-gray-600 text-sm dark:text-gray-400">
                <FormattedMessage
                  id="status.service_ended"
                  defaultMessage="Service Ended"
                />
                {' / '}
                <FormattedMessage
                  id="status.not_in_service"
                  defaultMessage="Not in Service"
                />
              </span>
            </div>
          </div>
        </div>
      </div>
    </IncludedEntitiesContext.Provider>
  );
};

export default HomePage;
