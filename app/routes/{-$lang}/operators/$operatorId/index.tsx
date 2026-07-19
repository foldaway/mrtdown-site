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
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildLocalizedAbsoluteUrl, buildSeoMetadata } from '~/helpers/seo';
import { useHydrated } from '~/hooks/useHydrated';
import { getOperatorProfileFn } from '~/util/operator.functions';
import { assert } from '../../../../util/assert';
import { OperatorCurrentStatusCard } from './components/OperatorCurrentStatusCard';
import { OperatorLinePerformanceCard } from './components/OperatorLinePerformanceCard';
import { OperatorQuickFactsCard } from './components/OperatorQuickFactsCard';
import { OperatorUptimeCard } from './components/OperatorUptimeCard';

const OPERATOR_PROFILE_DATE_COUNT = 90;

async function loadOperatorProfile(operatorId: string) {
  try {
    return await getOperatorProfileFn({
      data: {
        operatorId,
        days: OPERATOR_PROFILE_DATE_COUNT,
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
  const { data: operatorProfile, included, dateCount } = loaderData;
  const operator = included.operators[operatorProfile.operatorId];
  const intl = useIntl();
  const operatorName = getLocalizedTranslation(operator.name, intl.locale);
  const operatorDefaultName = getLocalizedTranslation(operator.name, 'en-SG');

  const isHydrated = useHydrated();

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="grid grid-cols-1 gap-y-5 md:grid-cols-12 md:gap-x-3">
        <header className="flex flex-col items-center gap-1 text-center md:col-span-12">
          <h1 className="font-bold text-gray-900 text-xl leading-tight sm:text-2xl dark:text-gray-100">
            {operatorName}
          </h1>
          {operatorDefaultName !== operatorName && (
            <p className="font-medium text-gray-500 text-sm leading-5 dark:text-gray-400">
              {operatorDefaultName}
            </p>
          )}
          <p className="mx-auto max-w-2xl text-gray-600 text-xs leading-4 sm:text-sm sm:leading-5 dark:text-gray-400">
            <FormattedMessage
              id="operator.description"
              defaultMessage="Check {operatorName} service status, uptime, disruptions, planned maintenance and performance across {lineCount, plural, one {# line} other {# lines}} in Singapore."
              values={{
                operatorName,
                lineCount: operatorProfile.lineIds.length,
              }}
            />
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
            {operator.foundedAt != null && (
              <span className="text-gray-500 dark:text-gray-400">
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
            )}
            {operator.foundedAt != null &&
              operatorProfile.yearsOfOperation != null && (
                <span className="text-gray-300 dark:text-gray-600">•</span>
              )}
            {operatorProfile.yearsOfOperation != null && (
              <span className="font-medium text-gray-700 dark:text-gray-200">
                <FormattedMessage
                  id="operator.years_of_operation_display"
                  defaultMessage="{years, plural, one {# year} other {# years}} of operation"
                  values={{ years: operatorProfile.yearsOfOperation }}
                />
              </span>
            )}
            {operator.url != null && (
              <a
                href={operator.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                <FormattedMessage
                  id="operator.website"
                  defaultMessage="Visit website"
                />
              </a>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 md:col-span-12 md:grid-cols-2">
          <OperatorUptimeCard
            aggregateUptimeRatio={operatorProfile.aggregateUptimeRatio}
            dateCount={dateCount}
          />

          <OperatorCurrentStatusCard
            currentOperationalStatus={operatorProfile.currentOperationalStatus}
            linesAffected={operatorProfile.linesAffected}
          />

          <OperatorQuickFactsCard operatorProfile={operatorProfile} />
        </section>

        <OperatorLinePerformanceCard
          linePerformanceComparison={operatorProfile.linePerformanceComparison}
          dateCount={dateCount}
        />

        <section className="grid grid-cols-1 gap-3 sm:gap-4 md:col-span-12 md:grid-cols-12">
          {operatorProfile.aggregateUptimeRatio != null && (
            <DeferredViewportWidget
              className="md:col-span-6"
              fallback={<ProfileTrendCardSkeleton />}
            >
              <UptimeRatioTrendCards
                graphs={operatorProfile.timeScaleGraphsUptimeRatios}
              />
            </DeferredViewportWidget>
          )}

          <DeferredViewportWidget
            className={
              operatorProfile.aggregateUptimeRatio != null
                ? 'md:col-span-6'
                : 'md:col-span-12'
            }
            fallback={<ProfileTrendCardSkeleton />}
          >
            <CountTrendCards
              graphs={operatorProfile.timeScaleGraphsIssueCount}
            />
          </DeferredViewportWidget>

          <DeferredViewportWidget
            className="md:col-span-12"
            fallback={<ProfileRecentIssuesSectionSkeleton />}
          >
            <RecentIssuesSection issueIds={operatorProfile.issueIdsRecent} />
          </DeferredViewportWidget>
        </section>
      </div>
    </IncludedEntitiesContext.Provider>
  );
}
