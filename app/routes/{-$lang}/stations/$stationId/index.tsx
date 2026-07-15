import { ChevronRightIcon } from '@heroicons/react/16/solid';
import { MapPinIcon } from '@heroicons/react/24/solid';
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
import { LineTypeLabels, StationStructureTypeLabels } from '~/constants';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildIssueTypeCountString } from '~/helpers/buildIssueTypeCountString';
import { getCanonicalStationPath } from '~/helpers/getCanonicalStationPath';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { getSeoStationCodes } from '~/helpers/getSeoStationCodes';
import { getVisibleStationMembershipsAt } from '~/helpers/isStationMembershipVisibleAt';
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
  const referenceAt = now.toISO();
  assert(referenceAt != null);
  const membershipsVisible = getVisibleStationMembershipsAt(
    station.memberships,
    referenceAt,
  );
  const stationCodes = getSeoStationCodes(station.memberships, referenceAt);
  for (const membership of station.memberships) {
    const line = included.lines[membership.lineId];
    _componentTypeStrings.add(intl.formatMessage(LineTypeLabels[line.type]));
    _transitTypeStrings.add(line.type === 'lrt' ? 'LRT' : 'MRT');

    _stationStructureTypes.add(
      intl.formatMessage(StationStructureTypeLabels[membership.structureType]),
    );
  }
  for (const membership of membershipsVisible) {
    const startedAt = DateTime.fromISO(membership.startedAt, {
      zone: 'Asia/Singapore',
    });
    if (startedAt < now) {
      operationalMemberSet.add(membership.code);
    }
  }
  return {
    townName,
    landmarkNames,
    stationCodes,
    membershipsVisible,
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
    const stationsUrl = buildLocalizedAbsoluteUrl('/stations', lang, rootUrl);

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
                    name: intl.formatMessage({
                      id: 'general.stations',
                      defaultMessage: 'Stations',
                    }),
                    item: stationsUrl,
                  },
                  {
                    '@type': 'ListItem',
                    position: 3,
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
  const isHydrated = useHydrated();

  const {
    townName,
    landmarkNames,
    stationCodes,
    stationStructureTypes,
    componentTypeStrings,
    transitTypeStrings,
    isInterchange,
    membershipsVisible,
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

  const membershipsUniqueVisible = useMemo(() => {
    const seenKeys = new Set<string>();
    return membershipsVisible.filter((membership) => {
      const key = `${membership.lineId}-${membership.code}`;
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    });
  }, [membershipsVisible]);

  const lineColorsUnique = useMemo(() => {
    const colors = new Set<string>();
    for (const membership of membershipsUniqueVisible) {
      const line = included.lines[membership.lineId];
      colors.add(line.color);
    }
    return Array.from(colors);
  }, [included.lines, membershipsUniqueVisible]);

  const rotatedLineColor = useRotatingLineColors(lineColorsUnique);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center space-x-1 text-gray-500 text-sm dark:text-gray-400"
        >
          <Link
            to="/{-$lang}"
            className="hover:text-gray-700 dark:hover:text-gray-200"
          >
            <FormattedMessage id="general.home" defaultMessage="Home" />
          </Link>
          <ChevronRightIcon className="size-4" />
          <Link
            to="/{-$lang}/stations"
            className="hover:text-gray-700 dark:hover:text-gray-200"
          >
            <FormattedMessage id="general.stations" defaultMessage="Stations" />
          </Link>
          <ChevronRightIcon className="size-4" />
          <span className="truncate text-gray-900 dark:text-gray-100">
            {stationName}
          </span>
        </nav>
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
                <Link
                  to="/{-$lang}/towns/$townId"
                  params={{ townId: station.townId }}
                  className="font-medium hover:underline"
                >
                  {townName}
                </Link>
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
                  gridTemplateColumns: `repeat(${membershipsUniqueVisible.length},1fr)`,
                }}
              >
                {membershipsUniqueVisible.map((membership) => (
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

        <div className="flex flex-col gap-4 pt-1 sm:gap-5 sm:pt-2">
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

          <section
            aria-labelledby="station-details-title"
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="px-4 py-2.5 sm:px-6 sm:py-3">
              <h2
                id="station-details-title"
                className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100"
              >
                <FormattedMessage
                  id="general.station_details"
                  defaultMessage="Station Details"
                />
              </h2>
            </div>

            <div className="border-gray-200 border-t sm:hidden dark:border-gray-700">
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {membershipsUnique.map((membership) => (
                  <li key={membership.code} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <LineMembershipLink
                        lineColor={included.lines[membership.lineId].color}
                        lineId={membership.lineId}
                        lineName={getLocalizedTranslation(
                          included.lines[membership.lineId].name,
                          intl.locale,
                        )}
                      />
                      <StationCode code={membership.code} />
                    </div>

                    <dl className="mt-2 grid grid-cols-3 gap-2">
                      <div>
                        <dt className="font-semibold text-[10px] text-gray-400 uppercase tracking-wide dark:text-gray-500">
                          <FormattedMessage
                            id="general.structure"
                            defaultMessage="Structure"
                          />
                        </dt>
                        <dd className="mt-0.5 text-gray-600 text-xs leading-4 dark:text-gray-300">
                          <FormattedMessage
                            {...StationStructureTypeLabels[
                              membership.structureType
                            ]}
                          />
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[10px] text-gray-400 uppercase tracking-wide dark:text-gray-500">
                          <FormattedMessage
                            id="general.opened"
                            defaultMessage="Opened"
                          />
                        </dt>
                        <dd className="mt-0.5 text-gray-600 text-xs leading-4 dark:text-gray-300">
                          <MembershipDate
                            compact
                            intl={intl}
                            isHydrated={isHydrated}
                            suppressFuture
                            value={membership.startedAt}
                          />
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[10px] text-gray-400 uppercase tracking-wide dark:text-gray-500">
                          <FormattedMessage
                            id="general.closed"
                            defaultMessage="Closed"
                          />
                        </dt>
                        <dd className="mt-0.5 text-gray-600 text-xs leading-4 dark:text-gray-300">
                          <MembershipDate
                            compact
                            intl={intl}
                            isHydrated={isHydrated}
                            value={membership.endedAt}
                          />
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </div>

            <div className="hidden border-gray-200 border-t sm:block dark:border-gray-700">
              <table className="w-full table-auto text-left">
                <thead>
                  <tr className="bg-gray-50/80 font-semibold text-[11px] text-gray-500 uppercase tracking-wide dark:bg-gray-900/20 dark:text-gray-400">
                    <th className="px-6 py-2">
                      <FormattedMessage
                        id="general.line"
                        defaultMessage="Line"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <FormattedMessage
                        id="general.station_code"
                        defaultMessage="Station Code"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <FormattedMessage
                        id="general.structure"
                        defaultMessage="Structure"
                      />
                    </th>
                    <th className="px-4 py-2">
                      <FormattedMessage
                        id="general.opened"
                        defaultMessage="Opened"
                      />
                    </th>
                    <th className="px-6 py-2">
                      <FormattedMessage
                        id="general.closed"
                        defaultMessage="Closed"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {membershipsUnique.map((membership) => (
                    <tr
                      key={membership.code}
                      className="text-gray-800 transition-colors hover:bg-gray-50/70 dark:text-gray-200 dark:hover:bg-gray-700/30"
                    >
                      <td className="px-6 py-2.5 align-middle">
                        <LineMembershipLink
                          lineColor={included.lines[membership.lineId].color}
                          lineId={membership.lineId}
                          lineName={getLocalizedTranslation(
                            included.lines[membership.lineId].name,
                            intl.locale,
                          )}
                        />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <StationCode code={membership.code} />
                      </td>
                      <td className="px-4 py-2.5 align-middle text-gray-500 text-xs leading-5 dark:text-gray-400">
                        <FormattedMessage
                          {...StationStructureTypeLabels[
                            membership.structureType
                          ]}
                        />
                      </td>
                      <td className="px-4 py-2.5 align-middle text-xs leading-5">
                        <MembershipDate
                          intl={intl}
                          isHydrated={isHydrated}
                          suppressFuture
                          value={membership.startedAt}
                        />
                      </td>
                      <td className="px-6 py-2.5 align-middle text-xs leading-5">
                        <MembershipDate
                          intl={intl}
                          isHydrated={isHydrated}
                          value={membership.endedAt}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <DeferredViewportWidget
            className="block"
            fallback={<ProfileRecentIssuesSectionSkeleton />}
          >
            <RecentIssuesSection issueIds={stationProfile.issueIdsRecent} />
          </DeferredViewportWidget>
        </div>
      </div>
    </IncludedEntitiesContext.Provider>
  );
}

function LineMembershipLink({
  lineColor,
  lineId,
  lineName,
}: {
  lineColor: string;
  lineId: string;
  lineName: string;
}) {
  return (
    <Link
      className="group flex min-w-0 items-center gap-2"
      to="/{-$lang}/lines/$lineId"
      params={{ lineId }}
    >
      <span
        className="shrink-0 rounded-md px-2 py-1 font-semibold text-white text-xs leading-none shadow-sm"
        style={{ backgroundColor: lineColor }}
      >
        {lineId}
      </span>
      <span className="min-w-0 font-medium text-gray-800 text-sm leading-5 group-hover:underline dark:text-gray-200">
        {lineName}
      </span>
    </Link>
  );
}

function StationCode({ code }: { code: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-gray-100 px-2 py-1 font-semibold text-gray-600 text-xs leading-none ring-1 ring-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600">
      {code}
    </span>
  );
}

function MembershipDate({
  compact = false,
  intl,
  isHydrated,
  suppressFuture = false,
  value,
}: {
  compact?: boolean;
  intl: IntlShape;
  isHydrated: boolean;
  suppressFuture?: boolean;
  value: string | null | undefined;
}) {
  if (value == null) {
    return '-';
  }

  if (!isHydrated) {
    return value;
  }

  const dateTime = DateTime.fromISO(value);
  if (suppressFuture && dateTime.diffNow().as('days') >= 0) {
    return '-';
  }

  return (
    <>
      <FormattedDate
        value={value}
        day="numeric"
        month={compact ? 'short' : 'long'}
        year="numeric"
      />
      {!compact && (
        <span className="text-gray-500 dark:text-gray-400">
          {' '}
          ({dateTime.reconfigure({ locale: intl.locale }).toRelative()})
        </span>
      )}
    </>
  );
}
