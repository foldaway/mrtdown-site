import { useQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { lazy } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  useIntl,
} from 'react-intl';
import { DeferredViewportWidget } from '~/components/DeferredViewportWidget';
import {
  ProfileRecentIssuesSectionSkeleton,
  ProfileTrendCardSkeleton,
} from '~/components/ProfileWidgetSkeletons';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { getDateCountForViewport } from '~/helpers/getDateCountForViewport';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildLocalizedAbsoluteUrl, buildSeoMetadata } from '~/helpers/seo';
import { useHydrated } from '~/hooks/useHydrated';
import { useViewport } from '~/hooks/useViewport';
import { getOperatorProfileFn } from '~/util/operator.functions';
import { assert } from '../../../../util/assert';
import { OperatorCurrentStatusCard } from './components/OperatorCurrentStatusCard';
import { OperatorLinePerformanceCard } from './components/OperatorLinePerformanceCard';
import { OperatorQuickFactsCard } from './components/OperatorQuickFactsCard';
import { OperatorUptimeCard } from './components/OperatorUptimeCard';

const OPERATOR_PROFILE_INITIAL_DATE_COUNT = 30;

async function loadOperatorProfile(operatorId: string) {
  try {
    return await getOperatorProfileFn({
      data: {
        operatorId,
        days: OPERATOR_PROFILE_INITIAL_DATE_COUNT,
      },
    });
  } catch (error) {
    if (error instanceof Response && error.status === 404) {
      throw notFound();
    }
    throw error;
  }
}

const CountTrendCards = lazy(() =>
  import('../../lines/$lineId/components/CountTrendCards').then((module) => ({
    default: module.CountTrendCards,
  })),
);
const UptimeRatioTrendCards = lazy(() =>
  import('../../lines/$lineId/components/UptimeRatioTrendCards').then(
    (module) => ({
      default: module.UptimeRatioTrendCards,
    }),
  ),
);
const RecentIssuesSection = lazy(() =>
  import('../../lines/$lineId/components/RecentIssuesSection').then(
    (module) => ({
      default: module.RecentIssuesSection,
    }),
  ),
);

export const Route = createFileRoute('/{-$lang}/operators/$operatorId/')({
  component: OperatorPage,
  loader: ({ params }) => loadOperatorProfile(params.operatorId),
  async head(ctx) {
    const { lang = 'en-SG' } = ctx.params;

    assert(ctx.loaderData != null);
    const { data: operatorProfile, included } = ctx.loaderData;

    const operator = included.operators[operatorProfile.operatorId];
    const operatorName = getLocalizedTranslation(operator.name, lang);

    const { default: messages } = await import(
      `../../../../../lang/${lang}.json`
    );

    const intl = createIntl({
      locale: lang,
      messages,
    });

    const title = intl.formatMessage(
      {
        id: 'general.operator_title',
        defaultMessage: '{operatorName} Status, Disruptions & Uptime | mrtdown',
      },
      { operatorName },
    );

    const description = intl.formatMessage(
      {
        id: 'operator.description',
        defaultMessage:
          'Check {operatorName} service status, uptime, disruptions, planned maintenance and performance across {lineCount, plural, one {# line} other {# lines}} in Singapore.',
      },
      {
        operatorName,
        lineCount: operatorProfile.lineIds.length,
      },
    );

    const rootUrl = import.meta.env.VITE_ROOT_URL;

    const seo = buildSeoMetadata({
      lang,
      path: `/operators/${ctx.params.operatorId}`,
      rootUrl,
    });

    const homeUrl = buildLocalizedAbsoluteUrl('/', lang, rootUrl);
    const webPageId = `${seo.canonicalUrl}#webpage`;
    const organizationId = `${seo.canonicalUrl}#organization`;

    const organizationData: Record<string, unknown> = {
      '@id': organizationId,
      '@type': 'Organization',
      name: operatorName,
      description,
    };

    if (operator.foundedAt != null) {
      organizationData.foundingDate = operator.foundedAt;
    }

    if (operator.url != null) {
      organizationData.url = operator.url;
      organizationData.sameAs = [operator.url];
    }

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
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:description',
          content: description,
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
          property: 'og:image:alt',
          content: `${operatorName} - Singapore MRT Operator`,
        },
        {
          property: 'og:site_name',
          content: 'mrtdown',
        },
        {
          property: 'og:locale',
          content: lang.replace('-', '_'),
        },
        {
          name: 'twitter:card',
          content: 'summary_large_image',
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
          name: 'twitter:image',
          content: seo.ogImage,
        },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@id': webPageId,
                '@type': 'WebPage',
                name: title,
                description,
                mainEntity: {
                  '@id': organizationId,
                },
                url: seo.ogUrl,
                image: seo.ogImage,
                inLanguage: lang,
              },
              organizationData,
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  {
                    '@type': 'ListItem',
                    position: 1,
                    name: intl.formatMessage({
                      id: 'general.home',
                      defaultMessage: 'Home',
                    }),
                    item: homeUrl,
                  },
                  {
                    '@type': 'ListItem',
                    position: 2,
                    name: operatorName,
                    item: seo.canonicalUrl,
                  },
                ],
              },
            ],
          },
        },
      ],
    };
  },
});

function OperatorPage() {
  const loaderData = Route.useLoaderData();
  const measuredViewport = useViewport();
  const desiredDateCount = getDateCountForViewport(measuredViewport);
  const expandedProfileQuery = useQuery({
    queryKey: [
      'operator-profile',
      loaderData.data.operatorId,
      desiredDateCount,
    ],
    queryFn: () =>
      getOperatorProfileFn({
        data: {
          operatorId: loaderData.data.operatorId,
          days: desiredDateCount,
        },
      }),
    enabled: desiredDateCount > loaderData.dateCount,
    staleTime: 60_000,
  });
  const activeData =
    desiredDateCount > loaderData.dateCount && expandedProfileQuery.data != null
      ? expandedProfileQuery.data
      : loaderData;

  const { data: operatorProfile, included, dateCount } = activeData;
  const operator = included.operators[operatorProfile.operatorId];
  const intl = useIntl();
  const operatorName = getLocalizedTranslation(operator.name, intl.locale);
  const operatorDefaultName = getLocalizedTranslation(operator.name, 'en-SG');

  const isHydrated = useHydrated();

  return (
    <IncludedEntitiesContext.Provider value={included}>
      {/* Operator Header Section */}
      <header className="flex flex-col justify-center">
        <h1 className="font-bold text-gray-900 text-xl leading-tight md:text-2xl dark:text-gray-100">
          {operatorName}
          {operatorDefaultName !== operatorName && (
            <span className="ml-2 text-gray-600 text-lg dark:text-gray-300">
              {operatorDefaultName}
            </span>
          )}
        </h1>

        <div className="flex items-center gap-x-2">
          <span className="text-gray-500 text-sm dark:text-gray-400">
            <FormattedMessage
              id="operator.founded"
              defaultMessage="Founded {date}"
              values={{
                date: isHydrated ? (
                  <FormattedDate
                    value={operator.foundedAt}
                    day="numeric"
                    month="long"
                    year="numeric"
                  />
                ) : (
                  operator.foundedAt
                ),
              }}
            />
          </span>
          <span className="text-gray-500 text-lg dark:text-gray-400">•</span>
          {operatorProfile.yearsOfOperation != null && (
            <span className="text-gray-900 text-sm dark:text-gray-50">
              <FormattedMessage
                id="operator.years_of_operation_display"
                defaultMessage="{years, plural, one {# year} other {# years}} of operation"
                values={{
                  years: operatorProfile.yearsOfOperation,
                }}
              />
            </span>
          )}
        </div>
        {operator.url != null && (
          <div className="flex flex-wrap items-center gap-1">
            <a
              href={operator.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 text-sm hover:underline"
            >
              <FormattedMessage
                id="operator.website"
                defaultMessage="Visit website"
              />
            </a>
          </div>
        )}
      </header>
      <div className="mt-4 grid grid-cols-1 gap-x-3 gap-y-5 md:grid-cols-12">
        <OperatorUptimeCard
          aggregateUptimeRatio={operatorProfile.aggregateUptimeRatio}
          dateCount={dateCount}
        />

        <OperatorCurrentStatusCard
          currentOperationalStatus={operatorProfile.currentOperationalStatus}
          linesAffected={operatorProfile.linesAffected}
        />

        <OperatorQuickFactsCard operatorProfile={operatorProfile} />

        <OperatorLinePerformanceCard
          linePerformanceComparison={operatorProfile.linePerformanceComparison}
          dateCount={dateCount}
        />

        {operatorProfile.aggregateUptimeRatio != null && (
          <DeferredViewportWidget
            className="md:col-span-12 lg:col-span-8"
            fallback={<ProfileTrendCardSkeleton />}
          >
            <UptimeRatioTrendCards
              graphs={operatorProfile.timeScaleGraphsUptimeRatios}
            />
          </DeferredViewportWidget>
        )}

        <DeferredViewportWidget
          className="md:col-span-12"
          fallback={<ProfileRecentIssuesSectionSkeleton />}
        >
          <RecentIssuesSection issueIds={operatorProfile.issueIdsRecent} />
        </DeferredViewportWidget>

        <DeferredViewportWidget
          className="md:col-span-12 lg:col-span-8"
          fallback={<ProfileTrendCardSkeleton />}
        >
          <CountTrendCards graphs={operatorProfile.timeScaleGraphsIssueCount} />
        </DeferredViewportWidget>
      </div>
    </IncludedEntitiesContext.Provider>
  );
}
