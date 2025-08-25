import { DateTime } from 'luxon';
import { useEffect, useMemo } from 'react';
import { createIntl, FormattedMessage } from 'react-intl';
import { useSearchParams } from 'react-router';
import { z } from 'zod';
import { getStatus } from '~/client';
import { IssueCard } from '~/components/IssueCard';
import { StatusBanner } from '~/components/StatusBanner';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { getDateCountForViewport } from '~/helpers/getDateCountForViewport';
import { ComponentOutlook } from '../../components/ComponentOutlook';
import { useViewport, ViewportSchema } from '../../hooks/useViewport';
import { assert } from '../../util/assert';
import type { Route } from './+types/route';

const RequestSchema = z.object({
  viewport: ViewportSchema.optional(),
});

export async function loader({ params, request }: Route.LoaderArgs) {
  const { lang = 'en-SG' } = params;
  const requestUrl = new URL(request.url);

  const validationResult = RequestSchema.safeParse(
    Object.fromEntries(requestUrl.searchParams),
  );
  if (!validationResult.success) {
    return new Response('Invalid query parameters', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  const viewport = validationResult.data.viewport ?? 'xs';
  const dateCount = getDateCountForViewport(viewport);

  const { default: messages } = await import(`../../../lang/${lang}.json`);
  const intl = createIntl({
    locale: lang,
    messages,
  });

  const { data, error } = await getStatus({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
    query: {
      days: dateCount,
    },
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

const StatusPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { overview, included } = loaderData;
  const { issues } = included;

  const [, setSearchParams] = useSearchParams();

  const viewport = useViewport();
  const dateCount = useMemo<number>(() => {
    return getDateCountForViewport(viewport);
  }, [viewport]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const newParams = new URLSearchParams(prev);
        newParams.set('viewport', viewport);
        return newParams;
      },
      {
        replace: true,
      },
    );
  }, [viewport, setSearchParams]);

  const dateTimes = useMemo(() => {
    const dateRangeEnd = DateTime.now()
      .startOf('hour')
      .setZone('Asia/Singapore');
    const results: DateTime[] = [];
    for (let i = 0; i < dateCount; i++) {
      results.unshift(dateRangeEnd.minus({ days: i }));
    }
    return results;
  }, [dateCount]);

  const issuesOngoing = useMemo(() => {
    return overview.issueOngoingIds.map((issueId) => issues[issueId]);
  }, [overview.issueOngoingIds, issues]);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col space-y-8">
        <header className="space-y-4 text-center">
          <h1 className="font-bold text-3xl text-gray-900 leading-tight sm:text-4xl dark:text-gray-100">
            <FormattedMessage
              id="site.status.title"
              defaultMessage="Current System Status"
            />
          </h1>
          <p className="mx-auto max-w-2xl text-gray-600 text-lg leading-relaxed dark:text-gray-400">
            <FormattedMessage
              id="site.status.subtitle"
              defaultMessage="Real-time service status and recent performance overview for all MRT and LRT lines"
            />
          </p>
        </header>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800">
          <StatusBanner issues={issuesOngoing} />
        </div>

        {issuesOngoing.length > 0 && (
          <div className="space-y-3">
            {issuesOngoing.map((issue) => (
              <IssueCard key={issue.id} issue={issue} className="!w-auto" />
            ))}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-y-6 p-6">
            {overview.lineSummaries.map((lineSummary) => (
              <ComponentOutlook
                key={lineSummary.lineId}
                data={lineSummary}
                dateTimes={dateTimes}
              />
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

export default StatusPage;
