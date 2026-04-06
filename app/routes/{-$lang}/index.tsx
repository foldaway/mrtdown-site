import { createFileRoute } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { useEffect, useMemo } from 'react';
import { createIntl, FormattedMessage } from 'react-intl';
import { z } from 'zod';
import { LineSummaryBlock } from '~/components/LineSummaryBlock';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { getDateCountForViewport } from '~/helpers/getDateCountForViewport';
import { useViewport, ViewportSchema } from '~/hooks/useViewport';
import { getOverviewFn } from '~/util/overview.functions';
import { CurrentAdvisoriesSection } from '../../components/CurrentAdvisoriesSection';
import { assert } from '../../util/assert';

const SearchParamsSchema = z.object({
  viewport: ViewportSchema.optional(),
});

export const Route = createFileRoute('/{-$lang}/')({
  component: HomePage,

  validateSearch: SearchParamsSchema,
  loaderDeps({ search }) {
    return { viewport: search.viewport ?? 'xs' };
  },
  async loader({ deps }) {
    const viewport = deps.viewport ?? 'xs';
    const dateCount = getDateCountForViewport(viewport);
    const { data, included } = await getOverviewFn({
      data: {
        viewport,
      },
    });
    return { overview: data, included, dateCount };
  },
  async head(ctx) {
    const lang = ctx.params.lang ?? 'en-SG';

    const { default: messages } = await import(`../../../lang/${lang}.json`);
    const intl = createIntl({
      locale: lang,
      messages,
    });

    const title = intl.formatMessage({
      id: 'general.home_page_title',
      defaultMessage: 'Is the MRT Down? Train Disruption Status in Singapore',
    });

    const description = intl.formatMessage({
      id: 'general.home_page_description',
      defaultMessage:
        'See if the MRT is down right now. Get live updates, maintenance alerts, and crowd-sourced reports from fellow commuters on mrtdown.',
    });

    const rootUrl = import.meta.env.VITE_ROOT_URL;
    assert(rootUrl != null, 'VITE_ROOT_URL is not set');

    let ogUrl = new URL(rootUrl).toString();
    if (lang !== 'en-SG') {
      ogUrl = new URL(`/${lang}/`, rootUrl).toString();
    }

    const ogImage = new URL('/og_image.png', rootUrl).toString();

    return {
      meta: [
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
      ],
    };
  },
});

function HomePage() {
  const loaderData = Route.useLoaderData();
  const { viewport } = Route.useSearch();
  const { overview, included, dateCount } = loaderData;
  const { issues } = included;

  const navigate = Route.useNavigate();

  const measuredViewport = useViewport();

  useEffect(() => {
    if (viewport === measuredViewport) {
      return;
    }
    navigate({
      search: {
        viewport: measuredViewport,
      },
      replace: true,
    });
  }, [viewport, measuredViewport, navigate]);

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

  const issuesActiveNow = useMemo(() => {
    return overview.issueIdsActiveNow.map((issueId) => issues[issueId]);
  }, [overview.issueIdsActiveNow, issues]);

  const issuesActiveToday = useMemo(() => {
    return overview.issueIdsActiveToday.map((issueId) => issues[issueId]);
  }, [overview.issueIdsActiveToday, issues]);

  const lineOperationalCount = useMemo(() => {
    return overview.lineSummaries.filter((line) => line.status === 'normal')
      .length;
  }, [overview.lineSummaries]);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col space-y-6 sm:space-y-8">
        <header className="flex flex-col items-center space-y-2 text-center">
          <h1 className="max-w-72 font-bold text-2xl text-gray-900 leading-tight sm:max-w-none sm:text-3xl dark:text-gray-100">
            <FormattedMessage
              id="site.landing.title"
              defaultMessage="Singapore MRT & LRT Service Status"
            />
          </h1>
          <p className="mx-auto max-w-64 text-base text-gray-600 leading-normal sm:max-w-none dark:text-gray-400">
            <FormattedMessage
              id="site.landing.subtitle"
              defaultMessage="Real-time service updates and current disruptions"
            />
          </p>
        </header>

        <CurrentAdvisoriesSection
          issuesActiveNow={issuesActiveNow}
          issuesActiveToday={issuesActiveToday}
          lineOperationalCount={lineOperationalCount}
        />

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-y-4 px-2 py-2 sm:gap-y-6 sm:px-3 sm:py-4">
            {overview.lineSummaries.map((lineSummary) => (
              <LineSummaryBlock
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
}
