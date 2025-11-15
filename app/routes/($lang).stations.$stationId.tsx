import { InformationCircleIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  type IntlShape,
  useIntl,
} from 'react-intl';
import { Link } from 'react-router';
import {
  getStationsStationIdProfile,
  type IncludedEntities,
  type IssueType,
  type Station,
} from '~/client';
import { IssueCard } from '~/components/IssueCard';
import type { IssueCardContext } from '~/components/IssueCard/types';
import { StationBar } from '~/components/StationBar';
import { LineTypeLabels, StationStructureTypeLabels } from '~/constants';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildIssueTypeCountString } from '~/helpers/buildIssueTypeCountString';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '~/hooks/useHydrated';
import { assert } from '../util/assert';
import type { Route } from './+types/($lang).stations.$stationId';

function computeStationStrings(
  intl: IntlShape,
  station: Station,
  included: IncludedEntities,
  now = DateTime.now(),
) {
  const town = included.towns[station.townId];
  const townName = town.nameTranslations[intl.locale] ?? town.name;
  const landmarkNames = station.landmarkIds.map((id) => {
    const landmark = included.landmarks[id];
    return landmark.nameTranslations[intl.locale] ?? landmark.name;
  });

  const operationalMemberSet = new Set<string>();
  const _componentTypeStrings = new Set<string>();
  const _stationStructureTypes = new Set<string>();
  const stationCodes = new Set<string>();
  for (const membership of station.memberships) {
    const line = included.lines[membership.lineId];
    _componentTypeStrings.add(intl.formatMessage(LineTypeLabels[line.type]));

    _stationStructureTypes.add(
      intl.formatMessage(StationStructureTypeLabels[membership.structureType]),
    );
    stationCodes.add(membership.code);
    const startedAt = DateTime.fromISO(membership.startedAt).setZone(
      'Asia/Singapore',
    );
    if (startedAt < now) {
      operationalMemberSet.add(membership.code);
    }
  }
  return {
    townName,
    landmarkNames,
    stationCodes,
    componentTypeStrings: Array.from(_componentTypeStrings),
    stationStructureTypes: Array.from(_stationStructureTypes),
    isInterchange: operationalMemberSet.size > 1,
  };
}

export async function loader({ params }: Route.LoaderArgs) {
  const { stationId, lang = 'en-SG' } = params;

  const rootUrl = process.env.ROOT_URL;

  const { data, error, response } = await getStationsStationIdProfile({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
    path: {
      stationId,
    },
  });
  if (error != null) {
    console.error('Error fetching station profile:', error);
    throw new Response('Failed to fetch station profile', {
      status: response.status,
      statusText: response.statusText,
    });
  }
  assert(data != null);
  const { data: stationProfile, included } = data;
  const station = included.stations[stationProfile.stationId];

  const { default: messages } = await import(`../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const stationName = station.nameTranslations[lang] ?? station.name;

  const title = intl.formatMessage(
    {
      id: 'general.station_title',
      defaultMessage: '{stationName} Station',
    },
    { stationName },
  );

  const {
    townName,
    landmarkNames,
    stationCodes,
    componentTypeStrings,
    stationStructureTypes,
    isInterchange,
  } = computeStationStrings(intl, station, included);

  const issueTypeCountString = buildIssueTypeCountString(
    stationProfile.issueCountByType as Record<IssueType, number>,
    intl,
  );

  const description = isInterchange
    ? intl.formatMessage(
        {
          id: 'station.description.interchange',
          defaultMessage:
            '{stationName} station is a {componentTypes} interchange station, located in {area} near {landmarks}. There have been {issueTypeCountString}.',
        },
        {
          stationName,
          componentTypes: intl.formatList(componentTypeStrings),
          area: townName,
          landmarks: intl.formatList(landmarkNames),
          issueTypeCountString,
        },
      )
    : intl.formatMessage(
        {
          id: 'station.description.non_interchange',
          defaultMessage:
            '{stationName} station is an {structureTypes} {componentTypes} station, located in {area} near {landmarks}. There have been {issueTypeCountString}.',
        },
        {
          stationName,
          area: townName,
          landmarks: intl.formatList(landmarkNames),
          structureTypes: intl.formatList(stationStructureTypes),
          componentTypes: intl.formatList(componentTypeStrings),
          issueTypeCountString,
        },
      );

  return {
    stationProfile,
    included,
    title,
    description,
    stationName,
    stationCodes: Array.from(stationCodes),
    rootUrl,
  };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ data, location }) => {
  const { title, description, stationName, stationCodes, rootUrl } = data;

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
          '@type': 'TrainStation',
          name: stationName,
          alternateName: stationCodes.join(' / '),
          description,
        },
        url: ogUrl,
        image: ogImage,
      },
    },
  ];
};

const StationPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { stationProfile, stationName, included } = loaderData;
  const station = included.stations[stationProfile.stationId];

  const intl = useIntl();
  const isHydrated = useHydrated();

  const { townName, landmarkNames, componentTypeStrings, isInterchange } =
    useMemo(() => {
      return computeStationStrings(intl, station, included);
    }, [station, intl, included]);

  const issueTypeCountString = useMemo(() => {
    return buildIssueTypeCountString(
      stationProfile.issueCountByType as Record<IssueType, number>,
      intl,
    );
  }, [stationProfile.issueCountByType, intl]);

  /**
   * Filter memberships to unique lineId-code pairs only.
   * Duplicates can occur due to different branches, or repeated occurrence in the same branch with a different sequence order.
   */
  const membershipsUnique = useMemo(() => {
    const seenKeys = new Set<string>();
    return station.memberships.filter((membership) => {
      const key = `${membership.lineId}-${membership.code}`;
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    });
  }, [station.memberships]);

  const issueCardContext = useMemo<IssueCardContext>(() => {
    return {
      type: 'history.days',
      date: DateTime.now().startOf('day').minus({ days: 30 }).toISODate(),
      days: 30,
    };
  }, []);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col gap-6">
        {/* Station Header Section */}
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 shadow-2xl dark:border-gray-600/60 dark:from-gray-800 dark:to-gray-900">
          <div className="relative p-4 sm:p-6">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/5 to-transparent dark:via-white/5" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StationBar memberships={membershipsUnique} />
                  {isInterchange && (
                    <span className="rounded-full bg-amber-500/20 px-3 py-0.5 font-medium text-amber-300 text-xs">
                      <FormattedMessage
                        id="station.interchange_badge"
                        defaultMessage="Interchange"
                      />
                    </span>
                  )}
                </div>

                <h1 className="mb-2 font-bold text-3xl text-gray-900 dark:text-white">
                  {stationName}
                  {station.name !== stationName && (
                    <span className="ml-2 text-gray-600 text-xl dark:text-gray-300">
                      {station.name}
                    </span>
                  )}
                </h1>

                <div className="text-gray-700 dark:text-gray-200">
                  <div className="mb-2 flex flex-wrap items-center gap-1 text-sm">
                    <MapPinIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                    <span className="font-medium">{townName}</span>
                    {landmarkNames.length > 0 && (
                      <>
                        <span className="text-gray-500 dark:text-gray-400">
                          •
                        </span>
                        <span>
                          <FormattedMessage
                            id="general.near_landmarks"
                            defaultMessage="Near {landmarkNames}"
                            values={{
                              landmarkNames: intl.formatList(landmarkNames),
                            }}
                          />
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <InformationCircleIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                    <span>{issueTypeCountString}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 text-right">
                <div className="text-gray-600 text-sm dark:text-gray-300">
                  <span className="inline-flex items-center gap-1">
                    <FormattedMessage
                      id="station.line_types_station"
                      defaultMessage="{lineTypes} station"
                      values={{
                        lineTypes: intl.formatList(componentTypeStrings),
                      }}
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Station Details Section */}
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg dark:border-gray-600/60 dark:bg-gray-800">
          <div className="p-4 sm:p-6">
            <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
              <FormattedMessage
                id="general.station_details"
                defaultMessage="Station Details"
              />
            </h2>
            <div className="mt-4 flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800">
              <table className="table-auto">
                <thead>
                  <tr className="border-gray-300 border-b bg-gray-100 text-gray-500 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    <th className="p-2 text-start">
                      <FormattedMessage
                        id="general.line"
                        defaultMessage="Line"
                      />
                    </th>
                    <th className="p-2 text-start">
                      <FormattedMessage
                        id="general.station_code"
                        defaultMessage="Station Code"
                      />
                    </th>
                    <th className="sm:!table-cell hidden p-2 text-start">
                      <FormattedMessage
                        id="general.structure"
                        defaultMessage="Structure"
                      />
                    </th>
                    <th className="p-2 text-start">
                      <FormattedMessage
                        id="general.opened"
                        defaultMessage="Opened"
                      />
                    </th>
                    <th className="p-2 text-start">
                      <FormattedMessage
                        id="general.closed"
                        defaultMessage="Closed"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300 dark:divide-gray-700">
                  {membershipsUnique.map((membership) => (
                    <tr
                      key={membership.code}
                      className="text-gray-900 dark:text-gray-200"
                    >
                      <td className="p-2 align-middle">
                        <Link
                          className="group flex flex-wrap items-center gap-x-1 gap-y-0.5"
                          to={buildLocaleAwareLink(
                            `/lines/${membership.lineId}`,
                            intl.locale,
                          )}
                        >
                          <span
                            className="rounded-md px-2 py-1 font-semibold text-white text-xs leading-none"
                            style={{
                              backgroundColor:
                                included.lines[membership.lineId].color,
                            }}
                          >
                            {membership.lineId}
                          </span>
                          <span className="text-sm group-hover:underline">
                            {included.lines[membership.lineId]
                              .titleTranslations[intl.locale] ??
                              included.lines[membership.lineId].title}
                          </span>
                        </Link>
                      </td>

                      <td className="p-2 align-middle">
                        <div className="inline-flex items-center rounded-lg border border-gray-300 px-2 py-0.5 dark:border-gray-700">
                          <span className="text-gray-500 text-sm leading-none dark:text-gray-400">
                            {membership.code}
                          </span>
                        </div>
                      </td>
                      <td className="sm:!table-cell hidden p-2 align-middle">
                        <span className="text-gray-500 text-sm leading-none dark:text-gray-400">
                          <FormattedMessage
                            {...StationStructureTypeLabels[
                              membership.structureType
                            ]}
                          />
                        </span>
                      </td>
                      <td className="p-2 align-middle">
                        <span className="inline-block text-sm">
                          {isHydrated ? (
                            <>
                              {DateTime.fromISO(membership.startedAt)
                                .diffNow()
                                .as('days') < 0 ? (
                                <>
                                  <FormattedDate
                                    value={membership.startedAt}
                                    day="numeric"
                                    month="long"
                                    year="numeric"
                                  />{' '}
                                  (
                                  {DateTime.fromISO(membership.startedAt)
                                    .reconfigure({ locale: intl.locale })
                                    .toRelative()}
                                  )
                                </>
                              ) : (
                                '-'
                              )}
                            </>
                          ) : (
                            membership.startedAt
                          )}
                        </span>
                      </td>
                      <td className="p-2 align-middle">
                        <span className="text-sm">
                          {membership.endedAt != null ? (
                            <>
                              {isHydrated ? (
                                <>
                                  <FormattedDate
                                    value={membership.endedAt}
                                    day="numeric"
                                    month="long"
                                    year="numeric"
                                  />{' '}
                                  (
                                  {DateTime.fromISO(membership.endedAt)
                                    .reconfigure({ locale: intl.locale })
                                    .toRelative()}
                                  )
                                </>
                              ) : (
                                membership.endedAt
                              )}
                            </>
                          ) : (
                            '-'
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent Issues Section */}
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg dark:border-gray-600/60 dark:bg-gray-800">
          <div className="p-4 sm:p-6">
            <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
              <FormattedMessage
                id="station.recent_issues"
                defaultMessage="Recent Issues"
              />
            </h2>

            <div className="mt-4 space-y-3">
              {stationProfile.issueIdsRecent.length > 0 ? (
                stationProfile.issueIdsRecent.map((issueId) => {
                  const issue = included.issues[issueId];

                  return (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      className="!w-auto"
                      context={issueCardContext}
                    />
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <InformationCircleIcon className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="mt-3 text-gray-600 dark:text-gray-400">
                    <FormattedMessage
                      id="station.no_recent_issues"
                      defaultMessage="No recent issues reported for this station"
                    />
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </IncludedEntitiesContext.Provider>
  );
};

export default StationPage;
