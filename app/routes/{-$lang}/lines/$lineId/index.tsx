import { createFileRoute } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  useIntl,
} from 'react-intl';
import type { IssueType } from '~/client';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildIssueTypeCountString } from '~/helpers/buildIssueTypeCountString';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { assert } from '~/util/assert';
import { getLineProfileFn } from '~/util/lines.functions';
import { CountTrendCards } from './components/CountTrendCards';
import { CurrentStatusCard } from './components/CurrentStatusCard';
import { LineSchematicCard } from './components/LineSchematicCard';
import { NextMaintenanceCard } from './components/NextMaintenanceCard';
import { QuickFactsCard } from './components/QuickFactsCard';
import { RecentIssuesSection } from './components/RecentIssuesSection';
import { StationInterchangesCard } from './components/StationInterchangesCard';
import { UptimeCard } from './components/UptimeCard';
import { UptimeRatioTrendCards } from './components/UptimeRatioTrendCards';

const DATE_COUNT = 90;

export const Route = createFileRoute('/{-$lang}/lines/$lineId/')({
  component: ComponentPage,
  loader: ({ params }) =>
    getLineProfileFn({ data: { lineId: params.lineId, days: DATE_COUNT } }),
  async head(ctx) {
    const { lineId, lang = 'en-SG' } = ctx.params;
    assert(ctx.loaderData != null);
    const { data: lineProfile, included } = ctx.loaderData;
    const { branches, issueCountByType } = lineProfile;
    const line = included.lines[lineId];
    const componentName = line.titleTranslations[lang] ?? line.title;

    const rootUrl = import.meta.env.VITE_ROOT_URL;

    const ogUrl = new URL(
      buildLocaleAwareLink(`/lines/${lineId}`, lang),
      rootUrl,
    ).toString();
    const ogImage = new URL('/og_image.png', rootUrl).toString();

    const { default: messages } = await import(
      `../../../../../lang/${lang}.json`
    );

    const intl = createIntl({
      locale: lang,
      messages,
    });

    const title = componentName;

    const issueTypeCountString = buildIssueTypeCountString(
      issueCountByType as Record<IssueType, number>,
      intl,
    );

    const stationIds = new Set<string>();
    for (const branch of branches) {
      for (const stationId of branch.stationIds) {
        const station = included.stations[stationId];
        const branchMembership = station.memberships.find(
          (membership) => membership.branchId === branch.id,
        );
        if (branchMembership == null) {
          continue;
        }

        if (
          branchMembership.startedAt == null ||
          branchMembership.endedAt != null
        ) {
          continue;
        }
        stationIds.add(stationId);
      }
    }

    const description =
      line.startedAt != null &&
      DateTime.fromISO(line.startedAt).diffNow().as('days') < 0
        ? intl.formatMessage(
            {
              id: 'general.component_description',
              defaultMessage:
                'The {componentName} began operations on {startDate}. It currently has {stationCount, plural, one {# station} other {# stations}}, with {issueTypeCountString} reported to date.',
            },
            {
              stationCount: stationIds.size,
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
              stationCount: stationIds.size,
              componentName,
              issueTypeCountString,
            },
          );

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
                  const stationName =
                    station.nameTranslations[lang] ?? station.name;

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
            url: ogUrl,
          },
        },
      ],
    };
  },
});

function ComponentPage() {
  const loaderData = Route.useLoaderData();
  const { data: lineProfile, included } = loaderData;
  const { lineId, branches, issueCountByType } = lineProfile;
  const line = included.lines[lineId];

  const intl = useIntl();
  const componentName = line.titleTranslations[intl.locale] ?? line.title;

  const stationCount = useMemo(() => {
    const stationIds = new Set<string>();
    for (const branch of branches) {
      for (const stationId of branch.stationIds) {
        const station = included.stations[stationId];
        const branchMembership = station.memberships.find(
          (membership) => membership.branchId === branch.id,
        );
        if (branchMembership == null) {
          continue;
        }

        if (
          branchMembership.startedAt == null ||
          branchMembership.endedAt != null
        ) {
          continue;
        }
        stationIds.add(stationId);
      }
    }
    return stationIds.size;
  }, [branches, included.stations]);

  const issueTypeCountString = useMemo(() => {
    return buildIssueTypeCountString(
      issueCountByType as Record<IssueType, number>,
      intl,
    );
  }, [issueCountByType, intl]);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="grid grid-cols-1 gap-x-3 gap-y-5 md:grid-cols-12">
        <div className="mb-8 overflow-hidden rounded-3xl border border-gray-600/60 bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl md:col-span-12">
          <div className="relative p-4 md:p-6">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            <div className="relative flex items-center gap-4">
              <div className="flex-shrink-0">
                <span
                  className="inline-flex items-center justify-center rounded-xl px-3 py-2 font-bold text-sm text-white shadow-lg ring-2 ring-white/20"
                  style={{ backgroundColor: line.color }}
                >
                  {line.id}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-black text-2xl text-white leading-tight md:text-3xl">
                  <FormattedMessage
                    id="general.component_status.heading"
                    defaultMessage="{componentName} outages in the last {dateCount} days"
                    values={{
                      componentName:
                        line.titleTranslations[intl.locale] ?? line.title,
                      dateCount: DATE_COUNT,
                    }}
                  />
                </h1>
                <div className="mt-4 rounded-lg bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-gray-200 text-sm leading-relaxed">
                    {line.startedAt != null &&
                    DateTime.fromISO(line.startedAt).diffNow().as('days') <
                      0 ? (
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
              </div>
            </div>
          </div>
        </div>

        <UptimeCard
          dateCount={DATE_COUNT}
          lineSummary={lineProfile.lineSummary}
        />

        <CurrentStatusCard lineSummary={lineProfile.lineSummary} />

        <NextMaintenanceCard
          lineId={lineId}
          issueId={lineProfile.issueIdNextMaintenance}
        />

        <LineSchematicCard line={line} branches={branches} />

        <QuickFactsCard line={line} branches={branches} />

        {lineProfile.lineSummary.status !== 'future_service' && (
          <UptimeRatioTrendCards
            graphs={lineProfile.timeScaleGraphsUptimeRatios}
          />
        )}

        <RecentIssuesSection issueIds={lineProfile.issueIdsRecent} />

        <CountTrendCards graphs={lineProfile.timeScaleGraphsIssueCount} />

        <StationInterchangesCard
          lineId={lineId}
          stationIds={lineProfile.stationIdsInterchanges}
        />
      </div>
    </IncludedEntitiesContext.Provider>
  );
}
