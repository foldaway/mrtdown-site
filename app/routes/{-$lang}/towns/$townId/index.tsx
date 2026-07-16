import { ChevronRightIcon } from '@heroicons/react/16/solid';
import { InformationCircleIcon, MapIcon } from '@heroicons/react/24/outline';
import type { IssueType } from '@mrtdown/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import {
  createIntl,
  FormattedMessage,
  FormattedNumber,
  FormattedTime,
  useIntl,
} from 'react-intl';
import { IssueCard } from '~/components/IssueCard';
import type { IssueCardContext } from '~/components/IssueCard/types';
import { LineBar } from '~/components/LineBar';
import { StationBar } from '~/components/StationBar';
import { StationMap } from '~/components/StationMap';
import { MapJul2026 } from '~/components/StationMap/components/MapJul2026';
import { LineSummaryStatusLabels } from '~/constants';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildIssueTypeCountString } from '~/helpers/buildIssueTypeCountString';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildLocalizedAbsoluteUrl, buildSeoMetadata } from '~/helpers/seo';
import type { Station } from '~/types';
import { assert } from '~/util/assert';
import type { TownStationStatus } from '~/util/db.queries';
import { getTownProfileFn } from '~/util/town.functions';

const SG_TIMEZONE = 'Asia/Singapore';

export const Route = createFileRoute('/{-$lang}/towns/$townId/')({
  component: TownPage,
  loader: ({ params }) => getTownProfileFn({ data: { townId: params.townId } }),
  async head(ctx) {
    const { townId, lang = 'en-SG' } = ctx.params;
    assert(ctx.loaderData != null);
    const { data, included } = ctx.loaderData;
    const town = included.towns[data.townId];
    const townName = getLocalizedTranslation(town.name, lang);
    const { default: messages } = await import(
      `../../../../../lang/${lang}.json`
    );
    const intl = createIntl({ locale: lang, messages });
    const rootUrl = import.meta.env.VITE_ROOT_URL;
    const seo = buildSeoMetadata({
      lang,
      path: `/towns/${townId}`,
      rootUrl,
    });
    const lineNames = data.lineIds.map((lineId) =>
      getLocalizedTranslation(included.lines[lineId].name, lang),
    );
    const title = intl.formatMessage(
      {
        id: 'town.page_title',
        defaultMessage:
          'MRT & LRT Stations in {townName} – Status & Disruptions | mrtdown',
      },
      { townName },
    );
    const description = intl.formatMessage(
      {
        id: 'town.page_description',
        defaultMessage:
          'Check live status, a map and recent disruptions for {stationCount, plural, one {the MRT or LRT station} other {all # MRT and LRT stations}} in {townName}, served by {lineNames}.',
      },
      {
        stationCount: data.stationIds.length,
        townName,
        lineNames: intl.formatList(lineNames),
      },
    );
    const homeUrl = buildLocalizedAbsoluteUrl('/', lang, rootUrl);
    const townsUrl = buildLocalizedAbsoluteUrl('/towns', lang, rootUrl);

    return {
      links: seo.links,
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: seo.ogUrl },
        { property: 'og:image', content: seo.ogImage },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'WebPage',
                name: title,
                description,
                inLanguage: lang,
                url: seo.ogUrl,
                image: seo.ogImage,
                mainEntity: {
                  '@type': 'Place',
                  name: townName,
                  identifier: town.id,
                  address: {
                    '@type': 'PostalAddress',
                    addressLocality: townName,
                    addressCountry: 'SG',
                  },
                  containsPlace: data.stationIds.map((stationId) => {
                    const station = included.stations[stationId];
                    return {
                      '@type': 'TrainStation',
                      name: getLocalizedTranslation(station.name, lang),
                      alternateName: getDisplayedMemberships(station)
                        .map((membership) => membership.code)
                        .join(' / '),
                      identifier: station.id,
                      url: buildLocalizedAbsoluteUrl(
                        `/stations/${station.id}`,
                        lang,
                        rootUrl,
                      ),
                      geo: {
                        '@type': 'GeoCoordinates',
                        latitude: station.geo.latitude,
                        longitude: station.geo.longitude,
                      },
                    };
                  }),
                },
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
                      id: 'general.towns',
                      defaultMessage: 'Towns',
                    }),
                    item: townsUrl,
                  },
                  {
                    '@type': 'ListItem',
                    position: 3,
                    name: townName,
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

function TownPage() {
  const { data, included } = Route.useLoaderData();
  const intl = useIntl();
  const town = included.towns[data.townId];
  const townName = getLocalizedTranslation(town.name, intl.locale);
  const stations = useMemo(
    () =>
      data.stationIds
        .map((stationId) => included.stations[stationId])
        .sort((a, b) =>
          getLocalizedTranslation(a.name, intl.locale).localeCompare(
            getLocalizedTranslation(b.name, intl.locale),
            intl.locale,
          ),
        ),
    [data.stationIds, included.stations, intl.locale],
  );
  const issueTypeCountString = useMemo(
    () =>
      buildIssueTypeCountString(
        data.issueCountByType as Record<IssueType, number>,
        intl,
      ),
    [data.issueCountByType, intl],
  );
  const totalIssueCount = Object.values(data.issueCountByType).reduce(
    (total, count) => total + count,
    0,
  );
  const referenceNow = useMemo(() => {
    const value = DateTime.fromISO(data.referenceNow, {
      setZone: true,
    }).setZone(SG_TIMEZONE);
    assert(value.isValid, 'Invalid town profile reference timestamp');
    return value;
  }, [data.referenceNow]);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col space-y-5 sm:space-y-7">
        <nav className="flex items-center space-x-1 text-gray-500 text-sm dark:text-gray-400">
          <Link
            to="/{-$lang}"
            className="hover:text-gray-700 dark:hover:text-gray-200"
          >
            <FormattedMessage id="general.home" defaultMessage="Home" />
          </Link>
          <ChevronRightIcon className="size-4" />
          <Link
            to="/{-$lang}/towns"
            className="hover:text-gray-700 dark:hover:text-gray-200"
          >
            <FormattedMessage id="general.towns" defaultMessage="Towns" />
          </Link>
          <ChevronRightIcon className="size-4" />
          <span className="truncate text-gray-900 dark:text-gray-100">
            {townName}
          </span>
        </nav>
        <header className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-bold text-gray-900 text-xl leading-tight sm:text-2xl dark:text-gray-100">
            <FormattedMessage
              id="town.heading"
              defaultMessage="MRT & LRT stations in {townName}"
              values={{ townName }}
            />
          </h1>
          <p className="mx-auto max-w-2xl text-gray-600 text-xs leading-4 sm:text-sm sm:leading-5 dark:text-gray-400">
            {totalIssueCount > 0 ? (
              <FormattedMessage
                id="town.intro.with_issues"
                defaultMessage="{townName} has {stationCount, plural, one {# rail station} other {# rail stations}} across {lineCount, plural, one {# line} other {# lines}}, with {issueTypeCountString} reported to date."
                values={{
                  townName,
                  stationCount: data.stationIds.length,
                  lineCount: data.lineIds.length,
                  issueTypeCountString,
                }}
              />
            ) : (
              <FormattedMessage
                id="town.intro.without_issues"
                defaultMessage="{townName} has {stationCount, plural, one {# rail station} other {# rail stations}} across {lineCount, plural, one {# line} other {# lines}}. No service issues have been reported here to date."
                values={{
                  townName,
                  stationCount: data.stationIds.length,
                  lineCount: data.lineIds.length,
                }}
              />
            )}
          </p>
        </header>

        <section
          className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
          aria-labelledby="town-summary-heading"
        >
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2
                id="town-summary-heading"
                className="font-semibold text-gray-900 text-sm sm:text-base dark:text-gray-100"
              >
                <FormattedMessage
                  id="general.current_status"
                  defaultMessage="Current Status"
                />
              </h2>
              <p className="mt-0.5 text-gray-500 text-xs dark:text-gray-400">
                <FormattedMessage
                  id="town.status.timestamp"
                  defaultMessage="As of {timestamp}"
                  values={{
                    timestamp: (
                      <FormattedTime
                        value={referenceNow.toJSDate()}
                        hour="numeric"
                        minute="2-digit"
                        timeZone={SG_TIMEZONE}
                      />
                    ),
                  }}
                />
              </p>
            </div>
            <TownStatus status={data.status} />
          </div>
          <dl className="grid grid-cols-3 border-gray-200 border-y dark:border-gray-700">
            <SummaryItem
              label={intl.formatMessage({
                id: 'town.summary.stations',
                defaultMessage: 'Stations',
              })}
              value={<FormattedNumber value={data.stationIds.length} />}
            />
            <SummaryItem
              label={intl.formatMessage({
                id: 'town.summary.lines',
                defaultMessage: 'Rail lines',
              })}
              value={<FormattedNumber value={data.lineIds.length} />}
            />
            <SummaryItem
              label={intl.formatMessage({
                id: 'town.summary.issues',
                defaultMessage: 'Issues reported',
              })}
              value={<FormattedNumber value={totalIssueCount} />}
            />
          </dl>
          <div className="p-4 sm:px-5">
            <p className="mb-2 text-gray-500 text-xs dark:text-gray-400">
              <FormattedMessage
                id="town.lines.heading"
                defaultMessage="Lines serving {townName}"
                values={{ townName }}
              />
            </p>
            <LineBar lineIds={data.lineIds} />
            <p className="mt-2 text-gray-500 text-xs leading-5 dark:text-gray-400">
              <FormattedMessage
                id="town.lines.description"
                defaultMessage="Select a line for network-wide status, maintenance and service history."
              />
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-gray-200 border-b px-4 py-4 sm:px-5 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 text-sm sm:text-base dark:text-gray-100">
              <FormattedMessage
                id="town.stations.heading"
                defaultMessage="Stations in {townName}"
                values={{ townName }}
              />
            </h2>
          </div>
          <div className="grid gap-2 p-2 sm:grid-cols-2 sm:p-3 lg:grid-cols-3">
            {stations.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                status={data.stationStatuses[station.id]}
              />
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
            <MapIcon className="mt-0.5 size-5 shrink-0 text-gray-400" />
            <div>
              <h2 className="font-semibold text-gray-900 text-sm sm:text-base dark:text-gray-100">
                <FormattedMessage
                  id="town.map.heading"
                  defaultMessage="{townName} stations on the map"
                  values={{ townName }}
                />
              </h2>
              <p className="mt-1 text-gray-600 text-xs leading-5 sm:text-sm dark:text-gray-400">
                <FormattedMessage
                  id="town.map.description"
                  defaultMessage="Stations in this area are highlighted on the Singapore rail network."
                />
              </p>
            </div>
          </div>
          <div className="border-gray-200 border-t bg-gray-100 p-2 sm:p-3 dark:border-gray-700 dark:bg-gray-900">
            <StationMap
              key={`${data.townId}:${data.mapReferenceDate}`}
              currentDate={data.mapReferenceDate}
              snapshotComponents={{ '2026-07': MapJul2026 }}
              stationNames={data.stationNames}
              mode={{
                type: 'focused-stations',
                stationIds: data.stationIds,
                showTimeline: false,
              }}
            />
          </div>
        </section>

        <RecentTownIssues
          issueIds={data.issueIdsRecent}
          townName={townName}
          referenceNow={data.referenceNow}
          days={data.recentIssueDays}
        />
      </div>
    </IncludedEntitiesContext.Provider>
  );
}

function TownStatus({ status }: { status: TownStationStatus }) {
  return (
    <div className="flex items-center gap-2">
      <StatusDot status={status} />
      <span className="font-medium text-gray-700 text-sm dark:text-gray-200">
        <TownStationStatusLabel status={status} />
      </span>
    </div>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border-gray-200 border-r px-3 py-3 text-center last:border-r-0 sm:px-4 dark:border-gray-700">
      <dd className="font-semibold text-gray-900 text-lg dark:text-gray-100">
        {value}
      </dd>
      <dt className="text-gray-500 text-xs dark:text-gray-400">{label}</dt>
    </div>
  );
}

function StationCard({
  station,
  status,
}: {
  station: Station;
  status: TownStationStatus;
}) {
  const intl = useIntl();
  const stationName = getLocalizedTranslation(station.name, intl.locale);
  const memberships = getDisplayedMemberships(station);

  return (
    <Link
      to="/{-$lang}/stations/$stationId"
      params={{ stationId: station.id }}
      title={stationName}
      className="group flex min-w-0 items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-700/50"
    >
      <div className="min-w-0">
        <h3 className="truncate font-semibold text-gray-900 text-sm group-hover:text-accent-light dark:text-gray-100">
          {stationName}
          <span className="sr-only">
            {' '}
            <FormattedMessage
              id="town.station.station_label"
              defaultMessage="MRT/LRT station"
            />
          </span>
        </h3>
        <div className="mt-1 flex items-center gap-1.5">
          <StatusDot status={status} />
          <span className="text-gray-500 text-xs dark:text-gray-400">
            <TownStationStatusLabel status={status} />
          </span>
        </div>
      </div>
      <StationBar memberships={memberships} />
    </Link>
  );
}

function TownStationStatusLabel({ status }: { status: TownStationStatus }) {
  if (status === 'not_in_service') {
    return (
      <FormattedMessage
        id="status.not_in_service"
        defaultMessage="Not in Service"
      />
    );
  }
  return <FormattedMessage {...LineSummaryStatusLabels[status]} />;
}

function StatusDot({ status }: { status: TownStationStatus }) {
  return (
    <span
      className={classNames('size-2.5 shrink-0 rounded-full', {
        'bg-disruption-light dark:bg-disruption-dark':
          status === 'ongoing_disruption',
        'bg-maintenance-light dark:bg-maintenance-dark':
          status === 'ongoing_maintenance',
        'bg-infra-light dark:bg-infra-dark': status === 'ongoing_infra',
        'bg-operational-light dark:bg-operational-dark': status === 'normal',
        'bg-gray-400 dark:bg-gray-500':
          status === 'closed_for_day' ||
          status === 'future_service' ||
          status === 'not_in_service',
      })}
      aria-hidden="true"
    />
  );
}

function RecentTownIssues({
  issueIds,
  townName,
  referenceNow,
  days,
}: {
  issueIds: string[];
  townName: string;
  referenceNow: string;
  days: number;
}) {
  const { issues } = Route.useLoaderData().included;
  const context = useMemo<IssueCardContext>(() => {
    const timestamp = DateTime.fromISO(referenceNow, {
      setZone: true,
    }).setZone(SG_TIMEZONE);
    assert(timestamp.isValid, 'Invalid town issue reference timestamp');
    const date = timestamp
      .startOf('day')
      .minus({ days: days - 1 })
      .toISODate();
    assert(date != null, 'Invalid town issue window start');
    return {
      type: 'history.days',
      date,
      days,
    };
  }, [days, referenceNow]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="font-semibold text-gray-900 text-sm sm:text-base dark:text-gray-100">
        <FormattedMessage
          id="town.recent_issues.heading"
          defaultMessage="Recent issues affecting {townName}"
          values={{ townName }}
        />
      </h2>
      <p className="mt-1 text-gray-600 text-xs leading-5 sm:text-sm dark:text-gray-400">
        <FormattedMessage
          id="town.recent_issues.description"
          defaultMessage="The latest reported disruptions, maintenance and infrastructure issues touching stations in this area."
        />
      </p>

      <div className="mt-3 space-y-3">
        {issueIds.length > 0 ? (
          issueIds.map((issueId) => (
            <IssueCard
              key={issueId}
              issue={issues[issueId]}
              className="!w-auto"
              context={context}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl bg-gray-50 py-8 text-center dark:bg-gray-900/50">
            <InformationCircleIcon className="size-10 text-gray-400 dark:text-gray-500" />
            <p className="mt-3 text-gray-600 text-sm dark:text-gray-400">
              <FormattedMessage
                id="town.recent_issues.empty"
                defaultMessage="No service issues have been reported for this area in the last 90 days."
              />
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function getDisplayedMemberships(station: Station) {
  const seen = new Set<string>();
  return station.memberships.filter((membership) => {
    if (membership.endedAt != null) {
      return false;
    }
    const key = `${membership.lineId}:${membership.code}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
