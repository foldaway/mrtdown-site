import {
  ArrowRightIcon,
  ExclamationTriangleIcon as OutlineExclamationTriangleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  ShieldCheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon as SolidClockIcon,
  Cog8ToothIcon,
  CubeIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid';
import { createFileRoute, Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { Tooltip } from '@base-ui/react/tooltip';
import { type ComponentType, type ReactNode, useMemo, useState } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  useIntl,
} from 'react-intl';
import { LineSummaryStatusLabels } from '~/constants';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildLocalizedAbsoluteUrl, buildSeoMetadata } from '~/helpers/seo';
import type { LineSummaryStatus } from '~/types';
import { assert } from '~/util/assert';
import { getStationsDirectoryFn } from '~/util/station.functions';

type StationsDirectoryPayload = Awaited<
  ReturnType<typeof getStationsDirectoryFn>
>;
type StationDirectoryEntry = StationsDirectoryPayload['stations'][number];

export const Route = createFileRoute('/{-$lang}/stations/')({
  component: StationsPage,
  loader: () => getStationsDirectoryFn(),
  async head(ctx) {
    const { lang = 'en-SG' } = ctx.params;
    assert(ctx.loaderData != null);
    const { stations } = ctx.loaderData;
    const { default: messages } = await import(`../../../../lang/${lang}.json`);
    const intl = createIntl({ locale: lang, messages });
    const operationalCount = stations.filter(
      (station) => station.operationalState === 'open',
    ).length;
    const futureCount = stations.filter(
      (station) => station.operationalState === 'future',
    ).length;
    const title = intl.formatMessage({
      id: 'stations.seo_title',
      defaultMessage:
        'Singapore MRT & LRT Stations List, Codes & Status | mrtdown',
    });
    const description = intl.formatMessage(
      {
        id: 'stations.seo_description',
        defaultMessage:
          'Browse Singapore MRT and LRT stations, including {operationalCount} operational and {futureCount} future stations. Search codes, lines, live status, opening dates and recent disruptions.',
      },
      { operationalCount, futureCount },
    );
    const rootUrl = import.meta.env.VITE_ROOT_URL;
    const seo = buildSeoMetadata({ lang, path: '/stations', rootUrl });
    const homeUrl = buildLocalizedAbsoluteUrl('/', lang, rootUrl);

    return {
      links: seo.links,
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:type', content: 'website' },
        { property: 'og:description', content: description },
        { property: 'og:url', content: seo.ogUrl },
        { property: 'og:image', content: seo.ogImage },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'CollectionPage',
                name: title,
                description,
                inLanguage: lang,
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

function StationsPage() {
  const { stations, lines, towns } = Route.useLoaderData();
  const intl = useIntl();
  const [search, setSearch] = useState('');
  const [lineId, setLineId] = useState('all');
  const [townId, setTownId] = useState('all');
  const [operationalState, setOperationalState] = useState('all');

  const lineOptions = useMemo(
    () =>
      Object.values(lines).sort((a, b) =>
        getLocalizedTranslation(a.name, intl.locale).localeCompare(
          getLocalizedTranslation(b.name, intl.locale),
          intl.locale,
        ),
      ),
    [intl.locale, lines],
  );
  const townOptions = useMemo(
    () =>
      Object.values(towns).sort((a, b) =>
        getLocalizedTranslation(a.name, intl.locale).localeCompare(
          getLocalizedTranslation(b.name, intl.locale),
          intl.locale,
        ),
      ),
    [intl.locale, towns],
  );

  const sortedStations = useMemo(
    () =>
      [...stations].sort((a, b) =>
        getLocalizedTranslation(a.name, intl.locale).localeCompare(
          getLocalizedTranslation(b.name, intl.locale),
          intl.locale,
        ),
      ),
    [intl.locale, stations],
  );

  const visibleStations = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase(intl.locale);
    return sortedStations.filter((station) => {
      if (
        lineId !== 'all' &&
        !station.memberships.some((membership) => membership.lineId === lineId)
      ) {
        return false;
      }
      if (townId !== 'all' && station.townId !== townId) {
        return false;
      }
      if (
        operationalState !== 'all' &&
        station.operationalState !== operationalState
      ) {
        return false;
      }
      if (normalizedSearch === '') {
        return true;
      }

      const lineSearchText = station.memberships
        .flatMap((membership) => {
          const line = lines[membership.lineId];
          return line == null
            ? [membership.lineId]
            : [membership.lineId, ...Object.values(line.name)];
        })
        .join(' ');
      const town = towns[station.townId];
      const searchText = [
        station.id,
        ...Object.values(station.name),
        ...station.memberships.map((membership) => membership.code),
        ...(town == null ? [] : Object.values(town.name)),
        lineSearchText,
      ]
        .join(' ')
        .toLocaleLowerCase(intl.locale);
      return searchText.includes(normalizedSearch);
    });
  }, [
    intl.locale,
    lineId,
    lines,
    operationalState,
    search,
    sortedStations,
    townId,
    towns,
  ]);

  const openCount = stations.filter(
    (station) => station.operationalState === 'open',
  ).length;
  const futureCount = stations.filter(
    (station) => station.operationalState === 'future',
  ).length;
  const hasActiveFilters =
    search !== '' ||
    lineId !== 'all' ||
    townId !== 'all' ||
    operationalState !== 'all';

  function clearFilters() {
    setSearch('');
    setLineId('all');
    setTownId('all');
    setOperationalState('all');
  }

  return (
    <div className="flex flex-col space-y-5 sm:space-y-7">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-bold text-gray-900 text-xl leading-tight sm:text-2xl dark:text-gray-100">
          <FormattedMessage
            id="stations.heading"
            defaultMessage="Singapore MRT & LRT stations"
          />
        </h1>
        <p className="max-w-xl text-gray-600 text-xs leading-4 sm:text-sm sm:leading-5 dark:text-gray-400">
          <FormattedMessage
            id="stations.introduction"
            defaultMessage="Search by station name, code, line, town or area, with live status and recent disruption history."
          />
        </p>
      </header>

      <section
        aria-label={intl.formatMessage({
          id: 'stations.directory_overview',
          defaultMessage: 'Directory overview',
        })}
        className="grid grid-cols-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm sm:grid-cols-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <SummaryStat
          value={stations.length}
          label={intl.formatMessage({
            id: 'general.stations',
            defaultMessage: 'Stations',
          })}
          dotClassName="bg-sky-500"
        />
        <SummaryStat
          value={openCount}
          label={intl.formatMessage({
            id: 'stations.open',
            defaultMessage: 'Operational',
          })}
          dotClassName="bg-operational-light dark:bg-operational-dark"
        />
        <SummaryStat
          value={futureCount}
          label={intl.formatMessage({
            id: 'stations.future',
            defaultMessage: 'Future',
          })}
          dotClassName="bg-violet-500"
        />
        <SummaryStat
          value={lineOptions.length}
          label={intl.formatMessage({
            id: 'stations.lines',
            defaultMessage: 'Rail lines',
          })}
          dotClassName="bg-amber-500"
        />
      </section>

      <section
        aria-labelledby="station-search-heading"
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
          <div>
            <h2
              id="station-search-heading"
              className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100"
            >
              <FormattedMessage
                id="stations.search_and_filter"
                defaultMessage="Find a station"
              />
            </h2>
            <p className="mt-0.5 hidden text-gray-500 text-xs sm:block dark:text-gray-400">
              <FormattedMessage
                id="stations.search_hint"
                defaultMessage="Use any combination of name, code, line and area."
              />
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-gray-600 text-xs transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <XMarkIcon className="size-3.5" />
              <FormattedMessage
                id="stations.clear_filters"
                defaultMessage="Clear filters"
              />
            </button>
          )}
        </div>
        <div className="grid gap-3 border-gray-200 border-t p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-[minmax(16rem,2fr)_repeat(3,minmax(0,1fr))] dark:border-gray-700">
          <label className="sm:col-span-3 lg:col-span-1">
            <span className="mb-1.5 block font-medium text-gray-600 text-xs dark:text-gray-300">
              <FormattedMessage
                id="stations.search_label"
                defaultMessage="Station name or code"
              />
            </span>
            <span className="relative block">
              <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={intl.formatMessage({
                  id: 'stations.search_placeholder',
                  defaultMessage: 'e.g. Bishan, NS17 or Circle Line',
                })}
                className="min-h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-9 text-gray-900 text-sm outline-none transition focus:border-accent-light focus:ring-2 focus:ring-accent-light/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </span>
          </label>
          <FilterSelect
            label={intl.formatMessage({
              id: 'stations.filter_line',
              defaultMessage: 'Line',
            })}
            value={lineId}
            onChange={setLineId}
          >
            <option value="all">
              {intl.formatMessage({
                id: 'stations.all_lines',
                defaultMessage: 'All lines',
              })}
            </option>
            {lineOptions.map((line) => (
              <option key={line.id} value={line.id}>
                {line.id} · {getLocalizedTranslation(line.name, intl.locale)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label={intl.formatMessage({
              id: 'stations.filter_town',
              defaultMessage: 'Town or area',
            })}
            value={townId}
            onChange={setTownId}
          >
            <option value="all">
              {intl.formatMessage({
                id: 'stations.all_towns',
                defaultMessage: 'All towns and areas',
              })}
            </option>
            {townOptions.map((town) => (
              <option key={town.id} value={town.id}>
                {getLocalizedTranslation(town.name, intl.locale)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label={intl.formatMessage({
              id: 'stations.filter_state',
              defaultMessage: 'Opening status',
            })}
            value={operationalState}
            onChange={setOperationalState}
          >
            <option value="all">
              {intl.formatMessage({
                id: 'stations.all_opening_states',
                defaultMessage: 'Open & future',
              })}
            </option>
            <option value="open">
              {intl.formatMessage({
                id: 'stations.open_stations',
                defaultMessage: 'Operational',
              })}
            </option>
            <option value="future">
              {intl.formatMessage({
                id: 'stations.future_stations',
                defaultMessage: 'Future stations',
              })}
            </option>
          </FilterSelect>
        </div>
      </section>

      <section aria-labelledby="station-results-heading">
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <h2
            id="station-results-heading"
            className="font-bold text-gray-900 text-lg dark:text-gray-100"
          >
            <FormattedMessage
              id="stations.results_heading"
              defaultMessage="Station list"
            />
          </h2>
          <p
            className="text-gray-500 text-sm dark:text-gray-400"
            aria-live="polite"
          >
            <FormattedMessage
              id="stations.results_count"
              defaultMessage="{count, plural, one {# result} other {# results}}"
              values={{ count: visibleStations.length }}
            />
          </p>
        </div>

        {visibleStations.length > 0 ? (
          <div className="divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
            {visibleStations.map((station) => {
              const town = towns[station.townId];
              return (
                <StationCard
                  key={station.id}
                  station={station}
                  lines={lines}
                  townName={
                    town == null
                      ? null
                      : getLocalizedTranslation(town.name, intl.locale)
                  }
                  townId={town?.id ?? null}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-800">
            <MagnifyingGlassIcon className="mx-auto size-8 text-gray-400" />
            <h3 className="mt-3 font-semibold text-gray-900 dark:text-gray-100">
              <FormattedMessage
                id="stations.no_results_heading"
                defaultMessage="No stations found"
              />
            </h3>
            <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
              <FormattedMessage
                id="stations.no_results_body"
                defaultMessage="Try another name or clear one of the filters."
              />
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryStat({
  value,
  label,
  dotClassName,
}: {
  value: number;
  label: string;
  dotClassName: string;
}) {
  return (
    <div className="border-gray-200 border-r border-b nth-[n+3]:border-b-0 px-4 py-3 even:border-r-0 sm:border-r sm:nth-[2n]:border-r sm:nth-[4n]:border-r-0 sm:border-b-0 sm:px-5 sm:py-4 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <span className={classNames('size-2 rounded-full', dotClassName)} />
        <span className="font-bold text-2xl text-gray-900 tabular-nums dark:text-gray-100">
          {value}
        </span>
      </div>
      <p className="mt-0.5 text-gray-500 text-xs dark:text-gray-400">{label}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label>
      <span className="mb-1.5 block font-medium text-gray-600 text-xs dark:text-gray-300">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 text-sm outline-none transition focus:border-accent-light focus:ring-2 focus:ring-accent-light/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      >
        {children}
      </select>
    </label>
  );
}

function StationCard({
  station,
  lines,
  townName,
  townId,
}: {
  station: StationDirectoryEntry;
  lines: StationsDirectoryPayload['lines'];
  townName: string | null;
  townId: string | null;
}) {
  const intl = useIntl();
  const stationName = getLocalizedTranslation(station.name, intl.locale);
  const memberships = station.memberships.filter(
    (membership, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.lineId === membership.lineId &&
          candidate.code === membership.code,
      ) === index,
  );
  const resolvedMemberships = memberships.flatMap((membership) => {
    const line = lines[membership.lineId];
    return line == null ? [] : [{ line, membership }];
  });

  return (
    <article className="group px-3 py-3 transition-colors hover:bg-gray-50 sm:px-4 dark:hover:bg-gray-900/30">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/{-$lang}/stations/$stationId"
              params={{ stationId: station.id }}
              className="font-bold text-gray-900 text-lg leading-tight transition-colors group-hover:text-accent-light dark:text-gray-100"
            >
              {stationName}
            </Link>
            <StationStatusIcon station={station} />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-500 text-xs dark:text-gray-400">
            {townName != null && townId != null && (
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon className="size-3.5 shrink-0" />
                <Link
                  to="/{-$lang}/towns/$townId"
                  params={{ townId }}
                  className="transition-colors hover:text-accent-light hover:underline"
                >
                  {townName}
                </Link>
              </span>
            )}
            <StationDisruptionHistory station={station} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-col items-end gap-1.5">
            {resolvedMemberships.map(({ line, membership }) => (
              <Link
                key={`${membership.lineId}:${membership.code}`}
                to="/{-$lang}/lines/$lineId"
                params={{ lineId: membership.lineId }}
                className="inline-flex items-center justify-end gap-1.5 text-gray-500 text-xs transition-colors hover:text-accent-light dark:text-gray-400"
              >
                <span className="hidden sm:inline">
                  {getLocalizedTranslation(line.name, intl.locale)}
                </span>
                <span
                  className="min-w-8 rounded px-1.5 py-0.5 text-center font-bold text-[11px] text-white leading-none shadow-sm"
                  style={{
                    backgroundColor: line.color,
                  }}
                >
                  {membership.code}
                </span>
              </Link>
            ))}
          </div>
          <Link
            to="/{-$lang}/stations/$stationId"
            params={{ stationId: station.id }}
            aria-label={intl.formatMessage(
              {
                id: 'stations.view_station',
                defaultMessage: 'View {stationName}',
              },
              { stationName },
            )}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-accent-light transition-colors hover:bg-accent-light/10 hover:text-accent-dark"
          >
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function StationStatusIcon({ station }: { station: StationDirectoryEntry }) {
  const intl = useIntl();

  if (station.operationalState === 'future') {
    return (
      <StatusIconWithTooltip
        Icon={CubeIcon}
        className="text-gray-400 dark:text-gray-500"
        label={intl.formatMessage({
          id: 'stations.future',
          defaultMessage: 'Future',
        })}
      />
    );
  }

  if (station.operationalState === 'closed') {
    return (
      <StatusIconWithTooltip
        Icon={SolidClockIcon}
        className="text-gray-400 dark:text-gray-500"
        label={intl.formatMessage({
          id: 'stations.closed',
          defaultMessage: 'Closed',
        })}
      />
    );
  }

  return <LiveStatusIcon status={station.status} />;
}

function LiveStatusIcon({ status }: { status: LineSummaryStatus }) {
  const intl = useIntl();
  const { Icon, className } = (
    {
      ongoing_disruption: {
        Icon: ExclamationTriangleIcon,
        className: 'text-disruption-light dark:text-disruption-dark',
      },
      ongoing_maintenance: {
        Icon: Cog8ToothIcon,
        className: 'text-maintenance-light dark:text-maintenance-dark',
      },
      ongoing_infra: {
        Icon: BuildingOffice2Icon,
        className: 'text-infra-light dark:text-infra-dark',
      },
      normal: {
        Icon: CheckCircleIcon,
        className: 'text-operational-light dark:text-operational-dark',
      },
      closed_for_day: {
        Icon: SolidClockIcon,
        className: 'text-gray-400 dark:text-gray-500',
      },
      future_service: {
        Icon: CubeIcon,
        className: 'text-gray-400 dark:text-gray-500',
      },
    } satisfies Record<
      LineSummaryStatus,
      { Icon: ComponentType<{ className?: string }>; className: string }
    >
  )[status];

  return (
    <StatusIconWithTooltip
      Icon={Icon}
      className={className}
      label={intl.formatMessage(LineSummaryStatusLabels[status])}
    />
  );
}

function StatusIconWithTooltip({
  Icon,
  className,
  label,
}: {
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  className: string;
  label: string;
}) {
  return (
    <Tooltip.Provider delay={100}>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <button
              type="button"
              aria-label={label}
              className={classNames(
                '-m-1 inline-flex shrink-0 items-center justify-center rounded-md p-1 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                className,
              )}
            />
          }
        >
          <Icon aria-hidden={true} className="size-5" />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={4}>
            <Tooltip.Popup className="z-50 rounded-md bg-gray-900 px-3 py-2 font-medium text-white text-xs shadow-lg dark:bg-gray-700">
              {label}
              <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function StationDisruptionHistory({
  station,
}: {
  station: StationDirectoryEntry;
}) {
  const intl = useIntl();

  if (station.latestDisruption == null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheckIcon className="size-3.5 shrink-0" />
        <FormattedMessage
          id="stations.no_recorded_disruptions"
          defaultMessage="No recorded disruptions"
        />
      </span>
    );
  }

  const formattedDate = intl.formatDate(station.latestDisruption.at, {
    dateStyle: 'medium',
  });
  const label = intl.formatMessage(
    {
      id: 'stations.latest_disruption',
      defaultMessage: 'Last disruption {date}',
    },
    { date: formattedDate },
  );

  return (
    <Tooltip.Provider delay={100}>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Link
              to="/{-$lang}/issues/$issueId"
              params={{ issueId: station.latestDisruption.id }}
              aria-label={label}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-accent-light"
            />
          }
        >
          <OutlineExclamationTriangleIcon className="size-3.5 shrink-0" />
          <FormattedDate
            value={station.latestDisruption.at}
            dateStyle="medium"
          />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={4}>
            <Tooltip.Popup className="z-50 rounded-md bg-gray-900 px-3 py-2 font-medium text-white text-xs shadow-lg dark:bg-gray-700">
              {label}
              <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
