import { InformationCircleIcon, MapPinIcon } from '@heroicons/react/24/outline';
import type { IssueType } from '@mrtdown/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { lazy, useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  type IntlShape,
  useIntl,
} from 'react-intl';
import { BetaBadge } from '~/components/BetaBadge';
import { DeferredViewportWidget } from '~/components/DeferredViewportWidget';
import {
  CommunitySignalsSectionSkeleton,
  ProfileRecentIssuesSectionSkeleton,
} from '~/components/ProfileWidgetSkeletons';
import { StationBar } from '~/components/StationBar';
import { LineTypeLabels, StationStructureTypeLabels } from '~/constants';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildIssueTypeCountString } from '~/helpers/buildIssueTypeCountString';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildSeoMetadata } from '~/helpers/seo';
import { useHydrated } from '~/hooks/useHydrated';
import type { IncludedEntities, Station } from '~/types';
import { getStationProfileFn } from '~/util/station.functions';
import { assert } from '../../../util/assert';

const CommunitySignalsSection = lazy(() =>
  import('~/components/CommunitySignalsSection').then((module) => ({
    default: module.CommunitySignalsSection,
  })),
);
const RecentIssuesSection = lazy(() =>
  import('./$stationId/components/RecentIssuesSection').then((module) => ({
    default: module.RecentIssuesSection,
  })),
);

function computeStationStrings(
  intl: IntlShape,
  station: Station,
  included: IncludedEntities,
  now = DateTime.now(),
) {
  const town = included.towns[station.townId];
  const townName = getLocalizedTranslation(town.name, intl.locale);
  const landmarkNames = station.landmarkIds.map((id) => {
    const landmark = included.landmarks[id];
    return getLocalizedTranslation(landmark.name, intl.locale);
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

export const Route = createFileRoute('/{-$lang}/stations/$stationId')({
  component: StationPage,
  loader: ({ params }) =>
    getStationProfileFn({ data: { stationId: params.stationId } }),
  async head(ctx) {
    const { stationId, lang = 'en-SG' } = ctx.params;
    assert(ctx.loaderData != null);
    const { data: stationProfile, included } = ctx.loaderData;
    const station = included.stations[stationProfile.stationId];

    const { default: messages } = await import(`../../../../lang/${lang}.json`);

    const intl = createIntl({
      locale: lang,
      messages,
    });

    const stationName = getLocalizedTranslation(station.name, lang);

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

    const rootUrl = import.meta.env.VITE_ROOT_URL;
    const seo = buildSeoMetadata({
      lang,
      path: `/stations/${stationId}`,
      rootUrl,
    });

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
              '@type': 'TrainStation',
              name: stationName,
              alternateName: Array.from(stationCodes).join(' / '),
              description,
            },
            url: seo.ogUrl,
            image: seo.ogImage,
          },
        },
      ],
    };
  },
});

function StationPage() {
  const loaderData = Route.useLoaderData();
  const { data: stationProfile, included } = loaderData;
  const station = included.stations[stationProfile.stationId];
  const intl = useIntl();
  const stationName = getLocalizedTranslation(station.name, intl.locale);
  const stationDefaultName = getLocalizedTranslation(station.name, 'en-SG');
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

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col gap-6">
        {/* Station Header Section */}
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg dark:border-gray-600/60 dark:bg-gray-800">
          <div className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StationBar memberships={membershipsUnique} />
                  {isInterchange && (
                    <span className="rounded-full bg-amber-500/10 px-3 py-0.5 font-medium text-amber-500 text-xs dark:text-amber-300">
                      <FormattedMessage
                        id="station.interchange_badge"
                        defaultMessage="Interchange"
                      />
                    </span>
                  )}
                </div>

                <h1 className="mb-2 font-bold text-3xl text-gray-900 dark:text-white">
                  {stationName}
                  {stationDefaultName !== stationName && (
                    <span className="ml-2 text-gray-600 text-xl dark:text-gray-300">
                      {stationDefaultName}
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
                <Link
                  to="/{-$lang}/report"
                  search={{ stationId: station.id }}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent-light px-4 py-2 font-semibold text-sm text-white transition-colors hover:bg-accent-dark"
                >
                  <FormattedMessage
                    id="station.report_cta"
                    defaultMessage="Report issue here"
                  />
                  <BetaBadge />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {stationProfile.communitySignals.length > 0 && (
          <DeferredViewportWidget
            className="block"
            fallback={<CommunitySignalsSectionSkeleton />}
          >
            <CommunitySignalsSection
              signals={stationProfile.communitySignals}
            />
          </DeferredViewportWidget>
        )}

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
                          to="/{-$lang}/lines/$lineId"
                          params={{ lineId: membership.lineId }}
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
                            {getLocalizedTranslation(
                              included.lines[membership.lineId].name,
                              intl.locale,
                            )}
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
                            DateTime.fromISO(membership.startedAt)
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
                            )
                          ) : (
                            membership.startedAt
                          )}
                        </span>
                      </td>
                      <td className="p-2 align-middle">
                        <span className="text-sm">
                          {membership.endedAt != null ? (
                            isHydrated ? (
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
                            )
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

        <DeferredViewportWidget
          className="block"
          fallback={<ProfileRecentIssuesSectionSkeleton />}
        >
          <RecentIssuesSection issueIds={stationProfile.issueIdsRecent} />
        </DeferredViewportWidget>
      </div>
    </IncludedEntitiesContext.Provider>
  );
}
