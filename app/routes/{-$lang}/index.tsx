import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { lazy, useMemo } from 'react';
import { createIntl, FormattedMessage } from 'react-intl';
import { BetaBadge } from '~/components/BetaBadge';
import { DeferredViewportWidget } from '~/components/DeferredViewportWidget';
import { LineSummaryBlock } from '~/components/LineSummaryBlock';
import { CommunitySignalsSectionSkeleton } from '~/components/ProfileWidgetSkeletons';
import { HOME_OVERVIEW_INITIAL_DATE_COUNT, LANGUAGES } from '~/constants';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { getDateCountForViewport } from '~/helpers/getDateCountForViewport';
import { buildSeoMetadata } from '~/helpers/seo';
import { useViewport } from '~/hooks/useViewport';
import { getOverviewFn } from '~/util/overview.functions';
import { CurrentAdvisoriesSection } from '../../components/CurrentAdvisoriesSection';
import { countOperationalLineSummaries } from '../../components/CurrentAdvisoriesSection/helpers';
import { assert } from '../../util/assert';
import { HomeLineSummariesSkeleton } from './components/HomeLineSummariesSkeleton';
import { sortLineSummariesWithFutureServiceLast } from './helpers/sortLineSummaries';

const CommunitySignalsSection = lazy(() =>
  import('~/components/CommunitySignalsSection').then((module) => ({
    default: module.CommunitySignalsSection,
  })),
);

export const Route = createFileRoute('/{-$lang}/')({
  component: HomePage,
  pendingComponent: HomePagePending,
  pendingMs: 0,
  pendingMinMs: 0,

  async loader({ params }) {
    const lang = params.lang ?? 'en-SG';
    if (!LANGUAGES.includes(lang)) {
      throw notFound();
    }

    const { data, included } = await getOverviewFn({
      data: { days: HOME_OVERVIEW_INITIAL_DATE_COUNT },
    });
    return {
      overview: data,
      included,
      dateCount: HOME_OVERVIEW_INITIAL_DATE_COUNT,
    };
  },
  async head(ctx) {
    const lang = ctx.params.lang ?? 'en-SG';
    if (!LANGUAGES.includes(lang)) {
      throw notFound();
    }

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

    const seo = buildSeoMetadata({ lang, path: '/', rootUrl });
    const websiteUrl = new URL('/', rootUrl).toString();
    const websiteId = `${websiteUrl}#website`;

    return {
      links: seo.links,
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
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:url',
          content: seo.ogUrl,
        },
        {
          property: 'og:image',
          content: seo.ogImage,
        },
        {
          property: 'og:site_name',
          content: 'mrtdown',
        },
        {
          name: 'twitter:title',
          content: title,
        },
        {
          name: 'twitter:description',
          content: description,
        },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'WebSite',
                '@id': websiteId,
                name: 'mrtdown',
                url: websiteUrl,
                inLanguage: LANGUAGES,
              },
              {
                '@type': 'WebPage',
                '@id': `${seo.canonicalUrl}#webpage`,
                name: title,
                description,
                url: seo.canonicalUrl,
                image: seo.ogImage,
                inLanguage: lang,
                isPartOf: {
                  '@id': websiteId,
                },
              },
            ],
          },
        },
      ],
    };
  },
});

function HomePage() {
  const loaderData = Route.useLoaderData();
  const measuredViewport = useViewport();
  const desiredDateCount = getDateCountForViewport(measuredViewport);
  const expandedOverviewQuery = useQuery({
    queryKey: ['home-overview', desiredDateCount],
    queryFn: () => getOverviewFn({ data: { days: desiredDateCount } }),
    enabled: desiredDateCount > loaderData.dateCount,
    staleTime: 60_000,
  });
  const activeData =
    desiredDateCount > loaderData.dateCount &&
    expandedOverviewQuery.data != null
      ? {
          overview: expandedOverviewQuery.data.data,
          included: expandedOverviewQuery.data.included,
          dateCount: desiredDateCount,
        }
      : loaderData;
  const { overview, included, dateCount } = activeData;
  const { issues } = included;

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

  const lineOperationalCount = useMemo(() => {
    return countOperationalLineSummaries({
      lineSummaries: overview.lineSummaries,
    });
  }, [overview.lineSummaries]);

  const sortedLineSummaries = useMemo(() => {
    return sortLineSummariesWithFutureServiceLast(overview.lineSummaries);
  }, [overview.lineSummaries]);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col space-y-5 sm:space-y-7">
        <header className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-bold text-gray-900 text-xl leading-tight sm:text-2xl dark:text-gray-100">
            <FormattedMessage
              id="site.landing.title"
              defaultMessage="Singapore MRT & LRT status"
            />
          </h1>
          <p className="max-w-64 text-gray-600 text-xs leading-4 sm:max-w-none sm:text-sm sm:leading-5 dark:text-gray-400">
            <FormattedMessage
              id="site.landing.subtitle"
              defaultMessage="Live updates and disruptions"
            />
          </p>
        </header>

        <CurrentAdvisoriesSection
          advisorySummary={overview.advisorySummary}
          issuesById={issues}
          lineOperationalCount={lineOperationalCount}
        />

        {overview.communitySignals.length > 0 && (
          <DeferredViewportWidget
            className="block"
            fallback={<CommunitySignalsSectionSkeleton />}
          >
            <CommunitySignalsSection signals={overview.communitySignals} />
          </DeferredViewportWidget>
        )}

        <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 sm:flex sm:justify-between sm:gap-4 sm:rounded-2xl sm:p-4 dark:border-sky-900 dark:bg-sky-950/30">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="font-semibold text-gray-900 text-sm leading-5 sm:text-base dark:text-gray-100">
                <FormattedMessage
                  id="home.report_cta_title"
                  defaultMessage="Seeing a train delay?"
                />
              </h2>
              <BetaBadge />
            </div>
            <p className="mt-1 hidden text-gray-600 text-sm leading-5 sm:block dark:text-gray-300">
              <FormattedMessage
                id="home.report_cta_body"
                defaultMessage="Share a community report for review. It stays separate from official service status."
              />
            </p>
          </div>
          <Link
            to="/{-$lang}/report"
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-accent-light px-3 py-1.5 font-semibold text-sm text-white transition-colors hover:bg-accent-dark sm:min-h-10 sm:px-4 sm:py-2"
          >
            <FormattedMessage
              id="home.report_cta"
              defaultMessage="Submit report"
            />
          </Link>
        </section>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-y-4 px-2 py-2 sm:gap-y-6 sm:px-3 sm:py-4">
            {sortedLineSummaries.map((lineSummary) => (
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
            <FormattedMessage
              id="home.service_status_legend"
              defaultMessage="Service Status Legend"
            />
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
                  defaultMessage="Off Hours"
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

function HomePagePending() {
  return (
    <div className="flex flex-col space-y-5 sm:space-y-7">
      <header className="flex flex-col items-center gap-1 text-center">
        <div className="h-7 w-44 max-w-full animate-pulse rounded-md bg-gray-200 sm:h-8 dark:bg-gray-800" />
        <div className="h-4 w-56 max-w-full animate-pulse rounded-md bg-gray-200 sm:h-5 sm:w-72 dark:bg-gray-800" />
      </header>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 h-6 w-44 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="h-12 grow animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
          <div className="h-10 w-36 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>

      <HomeLineSummariesSkeleton lineIds={PENDING_LINE_IDS} />

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="mx-auto mb-4 h-5 w-36 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
          {PENDING_LEGEND_IDS.map((legendId) => (
            <div className="inline-flex items-center gap-x-2" key={legendId}>
              <div className="size-3 animate-pulse rounded-full bg-gray-300 dark:bg-gray-700" />
              <div className="h-4 w-24 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PENDING_LINE_IDS = ['skeleton-line-1', 'skeleton-line-2'];
const PENDING_LEGEND_IDS = [
  'operational',
  'disruption',
  'maintenance',
  'infrastructure',
  'closed',
];
