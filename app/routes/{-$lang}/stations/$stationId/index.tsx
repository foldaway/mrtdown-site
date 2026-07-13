import { InformationCircleIcon, MapPinIcon } from '@heroicons/react/24/solid';
import type { IssueType } from '@mrtdown/core';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
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
import { getCanonicalStationPath } from '~/helpers/getCanonicalStationPath';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { getSeoStationCodes } from '~/helpers/getSeoStationCodes';
import { buildLocalizedAbsoluteUrl, buildSeoMetadata } from '~/helpers/seo';
import { useHydrated } from '~/hooks/useHydrated';
import type { IncludedEntities, Station } from '~/types';
import { getStationProfileFn } from '~/util/station.functions';
import { assert } from '~/util/assert';
import { useRotatingLineColors } from './hooks/useRotatingLineColors';

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
  const _transitTypeStrings = new Set<string>();
  const stationCodes = getSeoStationCodes(station.memberships);
  for (const membership of station.memberships) {
    const line = included.lines[membership.lineId];
    _componentTypeStrings.add(intl.formatMessage(LineTypeLabels[line.type]));
    _transitTypeStrings.add(line.type === 'lrt' ? 'LRT' : 'MRT');

    _stationStructureTypes.add(
      intl.formatMessage(StationStructureTypeLabels[membership.structureType]),
    );
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
    transitTypeStrings: Array.from(_transitTypeStrings),
    stationStructureTypes: Array.from(_stationStructureTypes),
    isInterchange: operationalMemberSet.size > 1,
  };
}

function formatStationHeading({
  intl,
  stationCodeString,
  stationName,
  transitTypeStrings,
}: {
  intl: IntlShape;
  stationCodeString: string;
  stationName: string;
  transitTypeStrings: string[];
}) {
  const values = {
    stationName,
    stationCodes: stationCodeString,
    transitTypes: intl.formatList(transitTypeStrings),
  };

  if (stationCodeString === '') {
    return intl.formatMessage(
      {
        id: 'station.heading_without_codes',
        defaultMessage: '{stationName} {transitTypes} Station',
      },
      values,
    );
  }

  return intl.formatMessage(
    {
      id: 'station.heading',
      defaultMessage: '{stationName} {transitTypes} Station ({stationCodes})',
    },
    values,
  );
}

export const Route = createFileRoute('/{-$lang}/stations/$stationId/')({
  component: StationPage,
  async loader({ params }) {
    const stationProfile = await getStationProfileFn({
      data: { stationId: params.stationId },
    });
    const canonicalPath = getCanonicalStationPath({
      lang: params.lang,
      requestedStationId: params.stationId,
      resolvedStationId: stationProfile.data.stationId,
    });

    if (canonicalPath != null) {
      throw redirect({ href: canonicalPath, statusCode: 308 });
    }

    return stationProfile;
  },
  async head(ctx) {
    const { stationId, lang = 'en-SG' } = ctx.params;
    assert(ctx.loaderData != null);
    const { data: stationProfile, included } = ctx.loaderData;
    const station = included.stations[stationProfile.stationId];

    const { default: messages } = await import(
      `../../../../../lang/${lang}.json`
    );

    const intl = createIntl({
      locale: lang,
      messages,
    });

    const stationName = getLocalizedTranslation(station.name, lang);

    const {
      townName,
      landmarkNames,
      stationCodes,
      stationStructureTypes,
      transitTypeStrings,
      isInterchange,
    } = computeStationStrings(intl, station, included);
    const stationCodeString = stationCodes.join(' / ');
    const stationHeading = formatStationHeading({
      intl,
      stationCodeString,
      stationName,
      transitTypeStrings,
    });
    const title = intl.formatMessage(
      {
        id: 'station.seo_title',
        defaultMessage: '{stationHeading} – Status & Disruptions | mrtdown',
      },
      { stationHeading },
    );

    const description = isInterchange
      ? landmarkNames.length > 0
        ? intl.formatMessage(
            {
              id: 'station.description.interchange',
              defaultMessage:
                'Check live status and recent issues for {stationHeading}, an interchange in {area} near {landmarks}.',
            },
            {
              stationHeading,
              area: townName,
              landmarks: intl.formatList(landmarkNames),
            },
          )
        : intl.formatMessage(
            {
              id: 'station.description.interchange_without_landmarks',
              defaultMessage:
                'Check live status and recent issues for {stationHeading}, an interchange in {area}.',
            },
            {
              stationHeading,
              area: townName,
            },
          )
      : landmarkNames.length > 0
        ? intl.formatMessage(
            {
              id: 'station.description.non_interchange',
              defaultMessage:
                'Check live status and recent issues for {stationHeading}, an {structureTypes} station in {area} near {landmarks}.',
            },
            {
              stationHeading,
              area: townName,
              landmarks: intl.formatList(landmarkNames),
              structureTypes: intl.formatList(stationStructureTypes),
            },
          )
        : intl.formatMessage(
            {
              id: 'station.description.non_interchange_without_landmarks',
              defaultMessage:
                'Check live status and recent issues for {stationHeading}, an {structureTypes} station in {area}.',
            },
            {
              stationHeading,
              area: townName,
              structureTypes: intl.formatList(stationStructureTypes),
            },
          );

    const rootUrl = import.meta.env.VITE_ROOT_URL;
    const seo = buildSeoMetadata({
      lang,
      path: `/stations/${stationId}`,
      rootUrl,
    });
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
                inLanguage: lang,
                mainEntity: {
                  '@type': 'TrainStation',
                  name: stationName,
                  ...(stationCodeString === ''
                    ? {}
                    : { alternateName: stationCodeString }),
                  identifier: station.id,
                  description,
                  url: seo.ogUrl,
                  geo: {
                    '@type': 'GeoCoordinates',
                    latitude: station.geo.latitude,
                    longitude: station.geo.longitude,
                  },
                  address: {
                    '@type': 'PostalAddress',
                    addressLocality: townName,
                    addressCountry: 'SG',
                  },
                },
                url: seo.ogUrl,
                image: seo.ogImage,
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
                    name: stationHeading,
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

function StationPage() {
  const loaderData = Route.useLoaderData();
  const { data: stationProfile, included } = loaderData;
  const station = included.stations[stationProfile.stationId];
  const intl = useIntl();
  const stationName = getLocalizedTranslation(station.name, intl.locale);
  const stationDefaultName = getLocalizedTranslation(station.name, 'en-SG');
  const isHydrated = useHydrated();

  const {
    townName,
    landmarkNames,
    stationCodes,
    stationStructureTypes,
    componentTypeStrings,
    transitTypeStrings,
    isInterchange,
  } = useMemo(() => {
    return computeStationStrings(intl, station, included);
  }, [station, intl, included]);
  const stationCodeString = stationCodes.join(' / ');
  const stationHeading = formatStationHeading({
    intl,
    stationCodeString,
    stationName,
    transitTypeStrings,
  });

  const issueTypeCountString = useMemo(() => {
    return buildIssueTypeCountString(
      stationProfile.issueCountByType as Record<IssueType, number>,
      intl,
    );
  }, [stationProfile.issueCountByType, intl]);
  const hasReportedIssues = Object.values(stationProfile.issueCountByType).some(
    (count) => count > 0,
  );

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

  const membershipsUniqueActive = useMemo(() => {
    return membershipsUnique.filter((membership) => {
      return membership.endedAt == null;
    });
  }, [membershipsUnique]);

  const lineColorsUnique = useMemo(() => {
    const colors = new Set<string>();
    for (const membership of membershipsUniqueActive) {
      const line = included.lines[membership.lineId];
      colors.add(line.color);
    }
    return Array.from(colors);
  }, [included.lines, membershipsUniqueActive]);

  const rotatedLineColor = useRotatingLineColors(lineColorsUnique);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col gap-3">
        {/* Station Header Section */}
        <header className="flex flex-col">
          <div className="grid grid-cols-1 grid-rows-[3fr_1fr_1fr] gap-x-1 bg-gray-400 [grid-template-areas:'main''aside1''aside2'] md:grid-cols-[3fr_6fr_3fr] md:grid-rows-1 dark:bg-gray-500 md:[grid-template-areas:'aside1_main_aside2']">
            {/* Aside 1 pane */}
            <div
              className="flex items-center justify-center bg-white transition-colors duration-500 [grid-area:aside1] md:border-b-8 dark:bg-gray-200"
              style={{ borderBottomColor: rotatedLineColor }}
            >
              <div className="inline-flex min-w-0 items-center gap-1 text-xs">
                <MapPinIcon className="size-4 text-gray-500" />
                <span className="font-medium">{townName}</span>
              </div>
            </div>
            {/* Main pane */}
            <div
              className="flex items-center justify-center gap-x-4 border-b-8 bg-zinc-800 py-3 transition-colors duration-500 [grid-area:'main']"
              style={{ borderBottomColor: rotatedLineColor }}
            >
              <div
                className="grid overflow-hidden rounded-2xl border-[3px] border-white"
                style={{
                  gridTemplateColumns: `repeat(${membershipsUniqueActive.length},1fr)`,
                }}
              >
                {membershipsUniqueActive.map((membership) => (
                  <span
                    key={membership.code}
                    className="inline-flex min-h-8 items-center justify-center px-1.5 py-0.5 font-bold text-lg text-white shadow-sm transition-colors md:px-2.5 md:py-1 md:text-xl"
                    style={{
                      backgroundColor: included.lines[membership.lineId].color,
                    }}
                  >
                    {membership.code}
                  </span>
                ))}
              </div>
              <div className="flex flex-col items-start">
                <h1 className="font-bold text-gray-100 text-xl leading-tight md:text-2xl">
                  {stationName}
                </h1>
                <div className="flex items-center gap-x-2">
                  {Object.entries(station.name)
                    .filter(([lang]) => lang !== intl.locale)
                    .map(([lang, translatedText]) => (
                      <p
                        key={lang}
                        className="font-medium text-gray-300 text-sm leading-5"
                      >
                        {translatedText}
                      </p>
                    ))}
                </div>
              </div>
            </div>
            {/* Aside 2 pane */}
            <div
              className="flex items-center justify-center bg-white transition-colors duration-500 [grid-area:'aside2'] md:border-b-8 dark:bg-gray-200"
              style={{ borderBottomColor: rotatedLineColor }}
            >
              <div className="inline-flex min-w-0 items-center gap-1.5 text-xs">
                <span className="mx-2 text-center">
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
        </header>

        <div className="mt-2 min-w-0 md:mt-0">
          <p className="border-gray-200 text-gray-700 text-sm leading-6 dark:border-gray-700 dark:text-gray-300">
            {isInterchange ? (
              landmarkNames.length > 0 ? (
                <FormattedMessage
                  id="station.display_description.interchange"
                  defaultMessage="{stationHeading} is an interchange in {area} near {landmarks}."
                  values={{
                    stationHeading,
                    area: townName,
                    landmarks: intl.formatList(landmarkNames),
                  }}
                />
              ) : (
                <FormattedMessage
                  id="station.display_description.interchange_without_landmarks"
                  defaultMessage="{stationHeading} is an interchange in {area}."
                  values={{
                    stationHeading,
                    area: townName,
                  }}
                />
              )
            ) : landmarkNames.length > 0 ? (
              <FormattedMessage
                id="station.display_description.non_interchange"
                defaultMessage="{stationHeading} is an {structureTypes} station in {area} near {landmarks}."
                values={{
                  stationHeading,
                  area: townName,
                  landmarks: intl.formatList(landmarkNames),
                  structureTypes: intl.formatList(stationStructureTypes),
                }}
              />
            ) : (
              <FormattedMessage
                id="station.display_description.non_interchange_without_landmarks"
                defaultMessage="{stationHeading} is an {structureTypes} station in {area}."
                values={{
                  stationHeading,
                  area: townName,
                  structureTypes: intl.formatList(stationStructureTypes),
                }}
              />
            )}{' '}
            {hasReportedIssues ? (
              <FormattedMessage
                id="station.display_description.issues_reported"
                defaultMessage="{issueTypeCountString} reported to date."
                values={{ issueTypeCountString }}
              />
            ) : (
              <FormattedMessage
                id="station.display_description.no_issues_reported"
                defaultMessage="No issues have been reported to date."
              />
            )}
          </p>
        </div>

        <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 sm:gap-4 sm:rounded-2xl sm:p-4 dark:border-sky-900 dark:bg-sky-950/30">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
                <FormattedMessage
                  id="station.report_cta_title"
                  defaultMessage="Seeing an issue at this station?"
                />
              </h2>
              <BetaBadge />
            </div>
            <p className="mt-1 hidden text-gray-600 text-xs leading-5 sm:block dark:text-gray-300">
              <FormattedMessage
                id="station.report_cta_note"
                defaultMessage="Community reports are reviewed separately from official operator advisories."
              />
            </p>
          </div>
          <Link
            to="/{-$lang}/report"
            search={{ stationId: station.id }}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-accent-light px-3 py-1.5 font-semibold text-white text-xs transition-colors hover:bg-accent-dark sm:min-h-10 sm:px-3 sm:py-1"
          >
            <span className="sm:hidden">
              <FormattedMessage
                id="station.report_cta_mobile"
                defaultMessage="Report issue"
              />
            </span>
            <span className="hidden sm:inline">
              <FormattedMessage
                id="station.report_cta"
                defaultMessage="Report issue here"
              />
            </span>
          </Link>
        </section>

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
