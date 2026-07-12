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
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import {
  CommunitySignalsSectionSkeleton,
  ProfileRecentIssuesSectionSkeleton,
  ProfileSystemMapCardSkeleton,
  ProfileTrendCardSkeleton,
} from '~/components/ProfileWidgetSkeletons';
import { buildIssueTypeCountString } from '~/helpers/buildIssueTypeCountString';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildSeoMetadata } from '~/helpers/seo';
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
const LineSystemMapCard = lazy(() =>
  import('./components/LineSystemMapCard').then((module) => ({
    default: module.LineSystemMapCard,
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
    const { branches, issueCountByType, stationCount } = lineProfile;
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

    const issueTypeCountString = buildIssueTypeCountString(
      issueCountByType as Record<IssueType, number>,
      intl,
    );

    const description = lineHasStarted(line)
      ? intl.formatMessage(
          {
            id: 'general.component_description',
            defaultMessage:
              'The {componentName} began operations on {startDate}. It currently has {stationCount, plural, one {# station} other {# stations}}, with {issueTypeCountString} reported to date.',
          },
          {
            stationCount,
            componentName,
            startDate: intl.formatDate(line.startedAt, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
            issueTypeCountString,
          },
        )
      : intl.formatMessage(
          {
            id: 'general.component_description_future',
            defaultMessage:
              'The {componentName} will begin operations in the future. It has {stationCount, plural, one {# station} other {# stations}} planned, with {issueTypeCountString} reported to date.',
          },
          {
            stationCount,
            componentName,
            issueTypeCountString,
          },
        );

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
            '@type': 'WebPage',
            name: title,
            mainEntity: {
              '@type': 'Place',
              name: componentName,
              identifier: line.id,
              containsPlace: branches.flatMap((branch) => {
                return branch.stationIds.map((stationId) => {
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
                  };
                });
              }),
            },
            url: seo.ogUrl,
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
          <header className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-gray-700 dark:bg-gray-800">
            <div>
              <div className="min-w-0">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="shrink-0 pt-0.5">
                    <span
                      className="inline-flex min-h-8 items-center justify-center rounded-md px-2.5 font-bold text-sm text-white shadow-sm"
                      style={{ backgroundColor: line.color }}
                    >
                      {line.id}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="font-bold text-gray-900 text-xl leading-tight sm:text-2xl dark:text-gray-100">
                      {componentName}
                    </h1>
                    <p className="mt-1 font-medium text-gray-700 text-sm leading-5 dark:text-gray-300">
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

                <p className="mt-4 border-gray-200 border-t pt-3 text-gray-700 text-sm leading-6 dark:border-gray-700 dark:text-gray-300">
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

                <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
                  <p className="text-gray-700 text-sm sm:hidden dark:text-gray-300">
                    <FormattedMessage
                      id="line.summary.mobile_started"
                      defaultMessage="Service began {startDate}"
                      values={{
                        startDate:
                          line.startedAt != null ? (
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              <FormattedDate
                                value={line.startedAt}
                                day="numeric"
                                month="long"
                                year="numeric"
                              />
                            </span>
                          ) : (
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              <FormattedMessage
                                id="line.summary.future_service"
                                defaultMessage="Future service"
                              />
                            </span>
                          ),
                      }}
                    />
                  </p>
                  <p className="mt-1 text-gray-500 text-xs sm:hidden dark:text-gray-400">
                    <FormattedMessage
                      id="line.summary.mobile_counts"
                      defaultMessage="{stationCount, plural, one {# station tracked} other {# stations tracked}} · {totalIssueCount, plural, one {# issue} other {# issues}} to date"
                      values={{
                        stationCount,
                        totalIssueCount,
                      }}
                    />
                  </p>

                  <div className="hidden flex-col gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="inline-flex min-w-0 items-baseline gap-1.5 text-sm">
                      <span className="shrink-0 font-medium text-gray-500 text-xs dark:text-gray-400">
                        <FormattedMessage
                          id="line.summary.started"
                          defaultMessage="Started"
                        />
                      </span>
                      <span className="truncate font-semibold text-gray-900 dark:text-gray-100">
                        {line.startedAt != null ? (
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

                    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <div className="inline-flex items-baseline gap-1.5">
                        <dt className="font-medium text-gray-500 dark:text-gray-400">
                          <FormattedMessage
                            id="line.summary.stations"
                            defaultMessage="Stations"
                          />
                        </dt>
                        <dd className="font-semibold text-gray-800 dark:text-gray-200">
                          <FormattedNumber value={stationCount} />
                        </dd>
                      </div>
                      <div className="inline-flex items-baseline gap-1.5">
                        <dt className="font-medium text-gray-500 dark:text-gray-400">
                          <FormattedMessage
                            id="line.summary.reported"
                            defaultMessage="Reported to date"
                          />
                        </dt>
                        <dd className="font-semibold text-gray-800 dark:text-gray-200">
                          <FormattedNumber value={totalIssueCount} />
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 sm:gap-4 sm:rounded-2xl sm:p-4 dark:border-sky-900 dark:bg-sky-950/30">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="font-semibold text-gray-900 text-sm leading-5 sm:text-base dark:text-gray-100">
                  <FormattedMessage
                    id="line.report_cta_title"
                    defaultMessage="Seeing an issue on this line?"
                  />
                </h2>
                <BetaBadge />
              </div>
              <p className="mt-1 hidden text-gray-600 text-sm leading-5 sm:block dark:text-gray-300">
                <FormattedMessage
                  id="line.report_cta_note"
                  defaultMessage="Community reports are reviewed separately from official operator advisories."
                />
              </p>
            </div>
            <Link
              to="/{-$lang}/report"
              search={{ lineId }}
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-accent-light px-3 py-1.5 font-semibold text-sm text-white transition-colors hover:bg-accent-dark sm:min-h-10 sm:px-4 sm:py-2"
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

        <DeferredViewportWidget
          className="md:col-span-4"
          fallback={<ProfileSystemMapCardSkeleton />}
        >
          <LineSystemMapCard line={line} branches={branches} />
        </DeferredViewportWidget>

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
