import type { IssueType } from '@mrtdown/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { lazy, useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  FormattedNumber,
  useIntl,
} from 'react-intl';
import { BetaBadge } from '~/components/BetaBadge';
import { DeferredViewportWidget } from '~/components/DeferredViewportWidget';
import {
  CommunitySignalsSectionSkeleton,
  ProfileRecentIssuesSectionSkeleton,
  ProfileTrendCardSkeleton,
} from '~/components/ProfileWidgetSkeletons';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildIssueTypeCountString } from '~/helpers/buildIssueTypeCountString';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildLocalizedAbsoluteUrl, buildSeoMetadata } from '~/helpers/seo';
import { assert } from '~/util/assert';
import { getLineProfileFn } from '~/util/lines.functions';
import { CurrentStatusCard } from './components/CurrentStatusCard';
import { LineSchematicCard } from './components/LineSchematicCard';
import { NextMaintenanceCard } from './components/NextMaintenanceCard';
import { QuickFactsCard } from './components/QuickFactsCard';
import { StationInterchangesCard } from './components/StationInterchangesCard';
import { UptimeCard } from './components/UptimeCard';

const CountTrendCards = lazy(() =>
  import('./components/CountTrendCards').then((module) => ({
    default: module.CountTrendCards,
  })),
);
const UptimeRatioTrendCards = lazy(() =>
  import('./components/UptimeRatioTrendCards').then((module) => ({
    default: module.UptimeRatioTrendCards,
  })),
);
const CommunitySignalsSection = lazy(() =>
  import('~/components/CommunitySignalsSection').then((module) => ({
    default: module.CommunitySignalsSection,
  })),
);
const RecentIssuesSection = lazy(() =>
  import('./components/RecentIssuesSection').then((module) => ({
    default: module.RecentIssuesSection,
  })),
);

const DATE_COUNT = 90;

function lineHasStarted<T extends { startedAt: string | null }>(
  line: T,
): line is T & { startedAt: string } {
  return (
    line.startedAt != null &&
    DateTime.fromISO(line.startedAt).diffNow().as('days') < 0
  );
}

export const Route = createFileRoute('/{-$lang}/lines/$lineId/')({
  component: ComponentPage,
  loader: ({ params }) =>
    getLineProfileFn({ data: { lineId: params.lineId, days: DATE_COUNT } }),
  async head(ctx) {
    const { lineId, lang = 'en-SG' } = ctx.params;
    assert(ctx.loaderData != null);
    const { data: lineProfile, included } = ctx.loaderData;
    const { branches, stationCount } = lineProfile;
    const line = included.lines[lineId];
    const componentName = getLocalizedTranslation(line.name, lang);

    const rootUrl = import.meta.env.VITE_ROOT_URL;

    const seo = buildSeoMetadata({
      lang,
      path: `/lines/${lineId}`,
      rootUrl,
    });

    const { default: messages } = await import(
      `../../../../../lang/${lang}.json`
    );

    const intl = createIntl({
      locale: lang,
      messages,
    });

    const title = intl.formatMessage(
      {
        id: 'line.page_title',
        defaultMessage:
          '{componentName} Status, Disruptions & Stations | mrtdown',
      },
      { componentName },
    );

    const description = lineHasStarted(line)
      ? intl.formatMessage(
          {
            id: 'line.page_description',
            defaultMessage:
              'Check {componentName} service status, 90-day uptime, disruptions, planned maintenance, operating hours and {stationCount, plural, one {its station} other {all # stations}}.',
          },
          {
            stationCount,
            componentName,
          },
        )
      : intl.formatMessage(
          {
            id: 'line.page_description_future',
            defaultMessage:
              "Explore {componentName} plans, future service status, planned stations, operators and maintenance updates for Singapore's rail network.",
          },
          {
            componentName,
          },
        );
    const stationIds = Array.from(
      new Set(branches.flatMap((branch) => branch.stationIds)),
    );
    const homeUrl = buildLocalizedAbsoluteUrl('/', lang, rootUrl);

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
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'WebPage',
                name: title,
                description,
                image: seo.ogImage,
                inLanguage: lang,
                mainEntity: {
                  '@type': 'Place',
                  name: componentName,
                  identifier: line.id,
                  url: seo.ogUrl,
                  containsPlace: stationIds.map((stationId) => {
                    const station = included.stations[stationId];
                    const stationName = getLocalizedTranslation(
                      station.name,
                      lang,
                    );

                    const alternateName = station.memberships
                      .map((membership) => membership.code)
                      .join(' / ');

                    return {
                      '@type': 'TrainStation',
                      name: stationName,
                      alternateName,
                      identifier: stationId,
                      url: buildLocalizedAbsoluteUrl(
                        `/stations/${stationId}`,
                        lang,
                        rootUrl,
                      ),
                    };
                  }),
                },
                url: seo.ogUrl,
              },
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
                    name: componentName,
                    item: seo.ogUrl,
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

function ComponentPage() {
  const loaderData = Route.useLoaderData();
  const { data: lineProfile, included } = loaderData;
  const { lineId, branches, issueCountByType, stationCount } = lineProfile;
  const line = included.lines[lineId];

  const intl = useIntl();
  const componentName = getLocalizedTranslation(line.name, intl.locale);

  const issueTypeCountString = useMemo(() => {
    return buildIssueTypeCountString(
      issueCountByType as Record<IssueType, number>,
      intl,
    );
  }, [issueCountByType, intl]);

  const totalIssueCount = useMemo(() => {
    return Object.values(issueCountByType as Record<IssueType, number>).reduce(
      (total, count) => total + count,
      0,
    );
  }, [issueCountByType]);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="grid grid-cols-1 gap-x-3 gap-y-5 md:grid-cols-12">
        <div className="flex flex-col gap-3 md:col-span-12">
          <header className="grid grid-cols-1 grid-rows-[3fr_1fr_1fr] gap-x-1 bg-gray-400 [grid-template-areas:'main''aside1''aside2'] md:grid-cols-[3fr_6fr_3fr] md:grid-rows-1 dark:bg-gray-500 md:[grid-template-areas:'aside1_main_aside2']">
            {/* Aside 1 pane */}
            <div
              className="flex items-center justify-center bg-white [grid-area:aside1] md:border-b-8 dark:bg-gray-200"
              style={{ borderBottomColor: line.color }}
            >
              <div className="inline-flex min-w-0 items-baseline gap-1.5 text-sm">
                <span className="shrink-0 font-medium text-gray-500 text-xs">
                  <FormattedMessage
                    id="line.summary.started"
                    defaultMessage="Started"
                  />
                </span>
                <span className="truncate font-semibold text-gray-900 text-xs">
                  {lineHasStarted(line) ? (
                    <FormattedDate
                      value={line.startedAt}
                      day="numeric"
                      month="long"
                      year="numeric"
                    />
                  ) : (
                    <FormattedMessage
                      id="line.summary.future_service"
                      defaultMessage="Future service"
                    />
                  )}
                </span>
              </div>
            </div>
            {/* Main pane */}
            <div
              className="flex items-center justify-center gap-x-4 border-b-8 bg-zinc-800 py-3 [grid-area:'main']"
              style={{ borderBottomColor: line.color }}
            >
              <span
                className="inline-flex min-h-8 items-center justify-center rounded-2xl border-[3px] bg-gray-50 px-2.5 py-1 font-bold text-white text-xl shadow-sm"
                style={{ backgroundColor: line.color }}
              >
                {line.id}
              </span>
              <div className="flex flex-col items-start">
                <h1 className="font-bold text-gray-100 text-xl leading-tight md:text-2xl">
                  {componentName}
                </h1>
                <p className="font-medium text-gray-300 text-sm leading-5">
                  <FormattedMessage
                    id="line.status_window.heading"
                    defaultMessage="Outages in the last {dateCount} days"
                    values={{
                      dateCount: DATE_COUNT,
                    }}
                  />
                </p>
              </div>
            </div>
            {/* Aside 2 pane */}
            <div
              className="flex items-center justify-center bg-white [grid-area:'aside2'] md:border-b-8 dark:bg-gray-200"
              style={{ borderBottomColor: line.color }}
            >
              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <div className="inline-flex items-baseline gap-1.5">
                  <dt className="font-medium text-gray-500">
                    <FormattedMessage
                      id="line.summary.stations"
                      defaultMessage="Stations"
                    />
                  </dt>
                  <dd className="font-semibold text-gray-800">
                    <FormattedNumber value={stationCount} />
                  </dd>
                </div>
                <div className="inline-flex items-baseline gap-1.5">
                  <dt className="font-medium text-gray-500">
                    <FormattedMessage
                      id="line.summary.reported"
                      defaultMessage="Reported to date"
                    />
                  </dt>
                  <dd className="font-semibold text-gray-800">
                    <FormattedNumber value={totalIssueCount} />
                  </dd>
                </div>
              </dl>
            </div>
          </header>

          <div className="mt-2 min-w-0 md:mt-0">
            <p className="text-gray-700 text-sm leading-6 dark:border-gray-700 dark:text-gray-300">
              {line.startedAt != null &&
              DateTime.fromISO(line.startedAt).diffNow().as('days') < 0 ? (
                <FormattedMessage
                  id="general.component_description"
                  defaultMessage="The {componentName} began operations on {startDate}. It currently has {stationCount, plural, one {# station} other {# stations}}, with {issueTypeCountString} reported to date."
                  values={{
                    stationCount,
                    componentName,
                    startDate: (
                      <FormattedDate
                        value={line.startedAt}
                        day="numeric"
                        month="long"
                        year="numeric"
                      />
                    ),
                    issueTypeCountString,
                  }}
                />
              ) : (
                <FormattedMessage
                  id="general.component_description_future"
                  defaultMessage="The {componentName} will begin operations in the future. It has {stationCount, plural, one {# station} other {# stations}} planned, with {issueTypeCountString} reported to date."
                  values={{
                    stationCount,
                    componentName,
                    issueTypeCountString,
                  }}
                />
              )}
            </p>
          </div>

          <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 sm:gap-4 sm:rounded-2xl sm:p-4 dark:border-sky-900 dark:bg-sky-950/30">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
                  <FormattedMessage
                    id="line.report_cta_title"
                    defaultMessage="Seeing an issue on this line?"
                  />
                </h2>
                <BetaBadge />
              </div>
              <p className="mt-1 hidden text-gray-600 text-xs leading-5 sm:block dark:text-gray-300">
                <FormattedMessage
                  id="line.report_cta_note"
                  defaultMessage="Community reports are reviewed separately from official operator advisories."
                />
              </p>
            </div>
            <Link
              to="/{-$lang}/report"
              search={{ lineId }}
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-accent-light px-3 py-1.5 font-semibold text-white text-xs transition-colors hover:bg-accent-dark sm:min-h-10 sm:px-3"
            >
              <span className="sm:hidden">
                <FormattedMessage
                  id="line.report_cta_mobile"
                  defaultMessage="Report issue"
                />
              </span>
              <span className="hidden sm:inline">
                <FormattedMessage
                  id="line.report_cta"
                  defaultMessage="Report an issue on this line"
                />
              </span>
            </Link>
          </section>
        </div>

        <UptimeCard
          dateCount={DATE_COUNT}
          lineSummary={lineProfile.lineSummary}
        />

        <CurrentStatusCard lineSummary={lineProfile.lineSummary} />

        {lineProfile.communitySignals.length > 0 && (
          <DeferredViewportWidget
            className="md:col-span-12"
            fallback={<CommunitySignalsSectionSkeleton />}
          >
            <CommunitySignalsSection signals={lineProfile.communitySignals} />
          </DeferredViewportWidget>
        )}

        <NextMaintenanceCard
          lineId={lineId}
          issueId={lineProfile.issueIdNextMaintenance}
        />

        <LineSchematicCard line={line} branches={branches} />

        <QuickFactsCard line={line} stationCount={stationCount} />

        {lineProfile.lineSummary.status !== 'future_service' && (
          <DeferredViewportWidget
            className="md:col-span-12 lg:col-span-8"
            fallback={<ProfileTrendCardSkeleton />}
          >
            <UptimeRatioTrendCards
              graphs={lineProfile.timeScaleGraphsUptimeRatios}
            />
          </DeferredViewportWidget>
        )}

        <DeferredViewportWidget
          className="md:col-span-12"
          fallback={<ProfileRecentIssuesSectionSkeleton />}
        >
          <RecentIssuesSection issueIds={lineProfile.issueIdsRecent} />
        </DeferredViewportWidget>

        <DeferredViewportWidget
          className="md:col-span-12 lg:col-span-8"
          fallback={<ProfileTrendCardSkeleton />}
        >
          <CountTrendCards graphs={lineProfile.timeScaleGraphsIssueCount} />
        </DeferredViewportWidget>

        <StationInterchangesCard
          lineId={lineId}
          stationIds={lineProfile.stationIdsInterchanges}
        />
      </div>
    </IncludedEntitiesContext.Provider>
  );
}
