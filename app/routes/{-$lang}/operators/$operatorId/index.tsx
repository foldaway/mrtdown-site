import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  useIntl,
} from 'react-intl';
import { z } from 'zod';
import { getOperatorsOperatorIdProfile, type IssueType } from '~/client';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildIssueTypeCountString } from '~/helpers/buildIssueTypeCountString';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { getDateCountForViewport } from '~/helpers/getDateCountForViewport';
import { useHydrated } from '~/hooks/useHydrated';
import { useViewport, ViewportSchema } from '~/hooks/useViewport';
import { getOperatorProfileFn } from '~/util/operator.functions';
import { assert } from '../../../../util/assert';
import { CountTrendCards } from '../../lines/$lineId/components/CountTrendCards';
import { RecentIssuesSection } from '../../lines/$lineId/components/RecentIssuesSection';
import { UptimeRatioTrendCards } from '../../lines/$lineId/components/UptimeRatioTrendCards';
import { OperatorCurrentStatusCard } from './components/OperatorCurrentStatusCard';
import { OperatorLinePerformanceCard } from './components/OperatorLinePerformanceCard';
import { OperatorQuickFactsCard } from './components/OperatorQuickFactsCard';
import { OperatorUptimeCard } from './components/OperatorUptimeCard';

const SearchParamsSchema = z.object({
  viewport: ViewportSchema.optional(),
});

export const Route = createFileRoute('/{-$lang}/operators/$operatorId/')({
  component: OperatorPage,
  validateSearch: SearchParamsSchema,
  loaderDeps: ({ search }) => ({ viewport: search.viewport ?? 'xs' }),
  loader: ({ params, deps }) =>
    getOperatorProfileFn({
      data: {
        operatorId: params.operatorId,
        days: getDateCountForViewport(deps.viewport),
      },
    }),
  async head(ctx) {
    const { lang = 'en-SG' } = ctx.params;

    assert(ctx.loaderData != null);
    const { data: operatorProfile, included, dateCount } = ctx.loaderData;

    const operator = included.operators[operatorProfile.operatorId];
    const operatorName = operator.nameTranslations[lang] ?? operator.name;

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
        defaultMessage: '{operatorName}',
      },
      { operatorName },
    );

    const issueTypeCountString = buildIssueTypeCountString(
      operatorProfile.totalIssuesByType as Record<IssueType, number>,
      intl,
    );

    const description = intl.formatMessage(
      {
        id: 'operator.description',
        defaultMessage:
          '{operatorName} operates {lineCount, plural, one {# line} other {# lines}} in the Singapore MRT network, with {issueTypeCountString} reported in the last {dateCount} days.',
      },
      {
        operatorName,
        lineCount: operatorProfile.lineIds.length,
        issueTypeCountString,
        dateCount,
      },
    );

    const rootUrl = import.meta.env.VITE_ROOT_URL;

    const ogUrl = new URL(
      buildLocaleAwareLink(`/operators/${ctx.params.operatorId}`, lang),
      rootUrl,
    ).toString();
    const ogImage = new URL('/og_image.png', rootUrl).toString();

    // Build enhanced Organization structured data
    const organizationData: Record<string, unknown> = {
      '@type': 'Organization',
      name: operatorName,
      description,
    };

    if (operator.foundedAt != null) {
      organizationData.foundingDate = operator.foundedAt;
    }

    if (operator.url != null) {
      organizationData.url = operator.url;
    }

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
          property: 'og:description',
          content: description,
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
          content: ogImage,
        },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: title,
            description,
            mainEntity: organizationData,
            url: ogUrl,
            image: ogImage,
            inLanguage: lang,
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
  const operatorName = operator.nameTranslations[intl.locale] ?? operator.name;

  const isHydrated = useHydrated();
  const navigate = Route.useNavigate();
  const viewport = useViewport();

  useEffect(() => {
    navigate({
      search: {
        viewport,
      },
    });
  }, [viewport, navigate]);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="grid grid-cols-1 gap-x-3 gap-y-5 md:grid-cols-12">
        {/* Operator Header Section */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-600/60 bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl md:col-span-12">
          <div className="relative p-4 md:p-6">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            <div className="relative">
              <h1 className="mb-2 font-black text-2xl text-white leading-tight md:text-3xl">
                {operatorName}
                {operator.name !== operatorName && (
                  <span className="ml-2 text-gray-300 text-xl">
                    {operator.name}
                  </span>
                )}
              </h1>
              <div className="mt-4 rounded-lg bg-white/10 p-4 backdrop-blur-sm">
                <div className="text-gray-200 text-sm leading-relaxed">
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    <span>
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
                    {operatorProfile.yearsOfOperation != null && (
                      <>
                        <span className="text-gray-400">•</span>
                        <span>
                          <FormattedMessage
                            id="operator.years_of_operation_display"
                            defaultMessage="{years, plural, one {# year} other {# years}} of operation"
                            values={{
                              years: operatorProfile.yearsOfOperation,
                            }}
                          />
                        </span>
                      </>
                    )}
                  </div>
                  {operator.url != null && (
                    <div className="flex flex-wrap items-center gap-1">
                      <a
                        href={operator.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-300 hover:underline"
                      >
                        <FormattedMessage
                          id="operator.website"
                          defaultMessage="Visit website"
                        />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

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
          <UptimeRatioTrendCards
            graphs={operatorProfile.timeScaleGraphsUptimeRatios}
          />
        )}

        <RecentIssuesSection issueIds={operatorProfile.issueIdsRecent} />

        <CountTrendCards graphs={operatorProfile.timeScaleGraphsIssueCount} />
      </div>
    </IncludedEntitiesContext.Provider>
  );
}
