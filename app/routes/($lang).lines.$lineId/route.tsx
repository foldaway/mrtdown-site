import { DateTime } from 'luxon';
import { useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  useIntl,
} from 'react-intl';
import { getLinesLineIdProfile, type IssueType } from '~/client';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildIssueTypeCountString } from '~/helpers/buildIssueTypeCountString';
import { UptimeRatioTrendCards } from '~/routes/($lang).lines.$lineId/components/UptimeRatioTrendCards';
import { assert } from '../../util/assert';
import type { Route } from './+types/route';
import { CountTrendCards } from './components/CountTrendCards';
import { CurrentStatusCard } from './components/CurrentStatusCard';
import { LineSchematicCard } from './components/LineSchematicCard';
import { NextMaintenanceCard } from './components/NextMaintenanceCard';
import { QuickFactsCard } from './components/QuickFactsCard';
import { RecentIssuesSection } from './components/RecentIssuesSection';
import { StationInterchangesCard } from './components/StationInterchangesCard';
import { UptimeCard } from './components/UptimeCard';

const DATE_COUNT = 90;

export async function loader({ params }: Route.LoaderArgs) {
  const { lineId, lang = 'en-SG' } = params;

  const rootUrl = process.env.ROOT_URL;

  const { data, error, response } = await getLinesLineIdProfile({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
    path: {
      lineId,
    },
    query: {
      days: DATE_COUNT,
    },
  });
  if (error != null) {
    console.error('Error fetching line:', error);
    throw new Response('Failed to fetch line', {
      status: response.status,
      statusText: response.statusText,
    });
  }
  assert(data != null);

  const { data: lineProfile, included } = data;
  const { branches, issueCountByType } = lineProfile;

  const line = included.lines[lineId];

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

  const { default: messages } = await import(`../../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const componentName = line.titleTranslations[lang] ?? line.title;
  const title = componentName;

  const issueTypeCountString = buildIssueTypeCountString(
    issueCountByType as Record<IssueType, number>,
    intl,
  );

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
    title,
    description,
    lineProfile,
    included,
    rootUrl,
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ params, data, location }) => {
  const { lang = 'en-SG' } = params;
  const { title, description, lineProfile, rootUrl, included } = data;
  const { lineId, branches } = lineProfile;
  const line = included.lines[lineId];
  const componentName = line.titleTranslations[lang] ?? line.title;

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
  ];
};

const ComponentPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { lineProfile, included } = loaderData;
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
};

export default ComponentPage;
