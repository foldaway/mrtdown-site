import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { createFileRoute, Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  FormattedNumber,
  useIntl,
} from 'react-intl';
import { LineSummaryStatusLabels } from '~/constants';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildLocalizedAbsoluteUrl, buildSeoMetadata } from '~/helpers/seo';
import type { LineSummaryStatus } from '~/types';
import { assert } from '~/util/assert';
import { getLinesDirectoryFn } from '~/util/lines.functions';

type LinesDirectoryPayload = Awaited<ReturnType<typeof getLinesDirectoryFn>>;
type LineDirectoryEntry = LinesDirectoryPayload['data']['lines'][number];

export const Route = createFileRoute('/{-$lang}/lines/')({
  component: LinesPage,
  loader: () => getLinesDirectoryFn(),
  async head(ctx) {
    const lang = ctx.params.lang ?? 'en-SG';
    assert(ctx.loaderData != null);
    const { data, included } = ctx.loaderData;
    const { default: messages } = await import(`../../../../lang/${lang}.json`);
    const intl = createIntl({ locale: lang, messages });
    const rootUrl = import.meta.env.VITE_ROOT_URL;
    const seo = buildSeoMetadata({ lang, path: '/lines', rootUrl });
    const currentCount = data.lines.filter(
      (line) => line.operationalState === 'current',
    ).length;
    const futureCount = data.lines.length - currentCount;
    const title = intl.formatMessage({
      id: 'lines.seo_title',
      defaultMessage: 'Singapore MRT & LRT Lines List & Status | mrtdown',
    });
    const description = intl.formatMessage(
      {
        id: 'lines.seo_description',
        defaultMessage:
          'Compare all {lineCount} Singapore MRT and LRT lines, including {currentCount} current and {futureCount} future lines, with station counts, operators, opening dates, live status and 90-day uptime.',
      },
      {
        lineCount: data.lines.length,
        currentCount,
        futureCount,
      },
    );
    const homeUrl = buildLocalizedAbsoluteUrl('/', lang, rootUrl);

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
                '@type': 'CollectionPage',
                name: title,
                description,
                url: seo.ogUrl,
                image: seo.ogImage,
                inLanguage: lang,
                mainEntity: {
                  '@type': 'ItemList',
                  numberOfItems: data.lines.length,
                  itemListElement: data.lines.map((entry, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: getLocalizedTranslation(
                      included.lines[entry.lineId].name,
                      lang,
                    ),
                    url: buildLocalizedAbsoluteUrl(
                      `/lines/${entry.lineId}`,
                      lang,
                      rootUrl,
                    ),
                  })),
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
                      id: 'general.lines',
                      defaultMessage: 'Lines',
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

function LinesPage() {
  const { data, included } = Route.useLoaderData();
  const intl = useIntl();

  const sortedLines = useMemo(
    () =>
      [...data.lines].sort((first, second) => {
        if (first.operationalState !== second.operationalState) {
          return first.operationalState === 'current' ? -1 : 1;
        }
        return getLocalizedTranslation(
          included.lines[first.lineId].name,
          intl.locale,
        ).localeCompare(
          getLocalizedTranslation(
            included.lines[second.lineId].name,
            intl.locale,
          ),
          intl.locale,
        );
      }),
    [data.lines, included.lines, intl.locale],
  );
  const currentLines = sortedLines.filter(
    (line) => line.operationalState === 'current',
  );
  const futureLines = sortedLines.filter(
    (line) => line.operationalState === 'future',
  );
  const mrtCount = data.lines.filter((line) => line.type !== 'lrt').length;
  const lrtCount = data.lines.length - mrtCount;

  return (
    <div className="flex flex-col space-y-5 sm:space-y-7">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-bold text-gray-900 text-xl leading-tight sm:text-2xl dark:text-gray-100">
          <FormattedMessage
            id="lines.heading"
            defaultMessage="Singapore MRT & LRT lines"
          />
        </h1>
        <p className="max-w-2xl text-gray-600 text-xs leading-4 sm:text-sm sm:leading-5 dark:text-gray-400">
          <FormattedMessage
            id="lines.introduction"
            defaultMessage="Compare every current and future rail line by live status, stations, operator, opening date and 90-day uptime."
          />
        </p>
      </header>

      <section
        aria-labelledby="lines-overview-heading"
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
          <h2
            id="lines-overview-heading"
            className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100"
          >
            <FormattedMessage
              id="lines.overview_heading"
              defaultMessage="Network at a glance"
            />
          </h2>
          <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-50 px-2 py-1 font-medium text-[11px] text-sky-700 ring-1 ring-sky-200 sm:py-0.5 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800">
            <ChartBarIcon className="size-3.5" />
            <FormattedMessage
              id="lines.total_count"
              defaultMessage="{count, plural, one {# line} other {# lines}}"
              values={{ count: data.lines.length }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 border-gray-200 border-t sm:grid-cols-4 dark:border-gray-700">
          <OverviewStat
            value={currentLines.length}
            label={intl.formatMessage({
              id: 'lines.current_network',
              defaultMessage: 'Current lines',
            })}
            iconClassName="text-operational-light dark:text-operational-dark"
            Icon={CheckCircleIcon}
          />
          <OverviewStat
            value={futureLines.length}
            label={intl.formatMessage({
              id: 'lines.future_network',
              defaultMessage: 'Future lines',
            })}
            iconClassName="text-violet-500"
            Icon={CalendarDaysIcon}
          />
          <OverviewStat
            value={mrtCount}
            label="MRT"
            iconClassName="text-sky-500"
            Icon={MapPinIcon}
          />
          <OverviewStat
            value={lrtCount}
            label="LRT"
            iconClassName="text-amber-500"
            Icon={MapPinIcon}
          />
        </div>
      </section>

      <section
        aria-labelledby="lines-directory-heading"
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h2
                id="lines-directory-heading"
                className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100"
              >
                <FormattedMessage
                  id="lines.directory_heading"
                  defaultMessage="All rail lines"
                />
              </h2>
              <p className="mt-0.5 text-gray-500 text-xs dark:text-gray-400">
                <FormattedMessage
                  id="lines.directory_description"
                  defaultMessage="Select a line for detailed status, station information and service history."
                />
              </p>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              <FormattedMessage
                id="lines.status_timestamp"
                defaultMessage="Status as of {timestamp, time, short}"
                values={{ timestamp: new Date() }}
              />
            </p>
          </div>
        </div>

        <DirectoryColumnHeadings />

        <LineGroup
          entries={currentLines}
          included={included}
          label={intl.formatMessage({
            id: 'lines.current_network',
            defaultMessage: 'Current lines',
          })}
          description={intl.formatMessage({
            id: 'lines.current_network_description',
            defaultMessage: 'Lines carrying passengers today',
          })}
          tone="current"
        />

        {futureLines.length > 0 && (
          <LineGroup
            entries={futureLines}
            included={included}
            label={intl.formatMessage({
              id: 'lines.future_network',
              defaultMessage: 'Future lines',
            })}
            description={intl.formatMessage({
              id: 'lines.future_network_description',
              defaultMessage: 'Lines planned or under construction',
            })}
            tone="future"
          />
        )}
      </section>
    </div>
  );
}

function OverviewStat({
  value,
  label,
  iconClassName,
  Icon,
}: {
  value: number;
  label: string;
  iconClassName: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="border-gray-200 border-r border-b nth-[n+3]:border-b-0 px-4 py-3 even:border-r-0 sm:border-r sm:nth-[2n]:border-r sm:nth-[4n]:border-r-0 sm:border-b-0 sm:px-5 sm:py-4 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <Icon className={classNames('size-4', iconClassName)} />
        <span className="font-bold text-2xl text-gray-900 tabular-nums dark:text-gray-100">
          <FormattedNumber value={value} />
        </span>
      </div>
      <p className="mt-0.5 text-gray-500 text-xs dark:text-gray-400">{label}</p>
    </div>
  );
}

function DirectoryColumnHeadings() {
  return (
    <div className="hidden grid-cols-[minmax(13rem,2.2fr)_minmax(8rem,1.2fr)_5rem_minmax(9rem,1.5fr)_7rem_6rem] gap-4 border-gray-200 border-t bg-gray-50/70 px-6 py-2 font-medium text-[11px] text-gray-500 uppercase tracking-wide lg:grid dark:border-gray-700 dark:bg-gray-900/20 dark:text-gray-400">
      <span>
        <FormattedMessage id="general.line" defaultMessage="Line" />
      </span>
      <span>
        <FormattedMessage
          id="general.current_status"
          defaultMessage="Current Status"
        />
      </span>
      <span>
        <FormattedMessage id="general.stations" defaultMessage="Stations" />
      </span>
      <span>
        <FormattedMessage id="general.operator" defaultMessage="Operator" />
      </span>
      <span>
        <FormattedMessage id="general.opened" defaultMessage="Opened" />
      </span>
      <span className="text-right">
        <FormattedMessage
          id="lines.uptime_90_days"
          defaultMessage="90-day uptime"
        />
      </span>
    </div>
  );
}

function LineGroup({
  entries,
  included,
  label,
  description,
  tone,
}: {
  entries: LineDirectoryEntry[];
  included: LinesDirectoryPayload['included'];
  label: string;
  description: string;
  tone: 'current' | 'future';
}) {
  return (
    <div className="border-gray-200 border-t dark:border-gray-700">
      <div
        className={classNames(
          'flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-4 py-2 sm:px-6',
          {
            'bg-emerald-50/60 dark:bg-emerald-950/15': tone === 'current',
            'bg-violet-50/60 dark:bg-violet-950/15': tone === 'future',
          },
        )}
      >
        <h3 className="font-semibold text-gray-800 text-xs uppercase tracking-wide dark:text-gray-200">
          {label}
        </h3>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {entries.map((entry) => (
          <LineDirectoryRow
            key={entry.lineId}
            entry={entry}
            included={included}
          />
        ))}
      </div>
    </div>
  );
}

function LineDirectoryRow({
  entry,
  included,
}: {
  entry: LineDirectoryEntry;
  included: LinesDirectoryPayload['included'];
}) {
  const intl = useIntl();
  const line = included.lines[entry.lineId];
  const lineName = getLocalizedTranslation(line.name, intl.locale);
  const operators = entry.operatorIds.flatMap((operatorId) => {
    const operator = included.operators[operatorId];
    return operator == null ? [] : [operator];
  });

  return (
    <article className="group relative grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 transition-colors hover:bg-gray-50 sm:px-6 lg:grid-cols-[minmax(13rem,2.2fr)_minmax(8rem,1.2fr)_5rem_minmax(9rem,1.5fr)_7rem_6rem] lg:items-center lg:gap-4 dark:hover:bg-gray-900/30">
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex min-w-11 shrink-0 items-center justify-center rounded-lg px-2 py-1.5 font-bold text-sm text-white shadow-sm"
            style={{ backgroundColor: line.color }}
          >
            {line.id}
          </span>
          <div className="min-w-0">
            <Link
              to="/{-$lang}/lines/$lineId"
              params={{ lineId: line.id }}
              className="inline-flex max-w-full items-center gap-1 font-semibold text-gray-900 text-sm transition-colors after:absolute after:inset-0 group-hover:text-accent-light dark:text-gray-100"
            >
              <span className="truncate">{lineName}</span>
              <ArrowRightIcon className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p className="mt-0.5 text-gray-500 text-xs dark:text-gray-400">
              {entry.type === 'lrt' ? 'LRT' : 'MRT'}
            </p>
          </div>
        </div>
      </div>

      <DirectoryValue
        label={intl.formatMessage({
          id: 'general.current_status',
          defaultMessage: 'Current Status',
        })}
      >
        <StatusLabel status={entry.status} />
      </DirectoryValue>

      <DirectoryValue
        label={intl.formatMessage({
          id: 'general.stations',
          defaultMessage: 'Stations',
        })}
      >
        <span className="font-semibold tabular-nums">
          <FormattedNumber value={entry.stationCount} />
        </span>
      </DirectoryValue>

      <DirectoryValue
        className="relative z-10"
        label={intl.formatMessage({
          id: 'general.operator',
          defaultMessage: 'Operator',
        })}
      >
        {operators.length > 0 ? (
          <span className="flex flex-wrap gap-x-1">
            {operators.map((operator, index) => (
              <span key={operator.id}>
                {index > 0 && ', '}
                <Link
                  to="/{-$lang}/operators/$operatorId"
                  params={{ operatorId: operator.id }}
                  className="transition-colors hover:text-accent-light hover:underline"
                >
                  {getLocalizedTranslation(operator.name, intl.locale)}
                </Link>
              </span>
            ))}
          </span>
        ) : (
          <FormattedMessage id="general.unknown" defaultMessage="Unknown" />
        )}
      </DirectoryValue>

      <DirectoryValue
        label={intl.formatMessage({
          id: 'general.opened',
          defaultMessage: 'Opened',
        })}
      >
        {entry.openingDate == null ? (
          <FormattedMessage id="general.unknown" defaultMessage="Unknown" />
        ) : (
          <FormattedDate
            value={entry.openingDate}
            day="numeric"
            month="short"
            year="numeric"
          />
        )}
      </DirectoryValue>

      <DirectoryValue
        className="lg:text-right"
        label={intl.formatMessage({
          id: 'lines.uptime_90_days',
          defaultMessage: '90-day uptime',
        })}
      >
        {entry.uptimeRatio == null ? (
          <span className="text-gray-400 dark:text-gray-500">N/A</span>
        ) : (
          <span>
            <span className="font-semibold tabular-nums">
              <FormattedNumber
                value={entry.uptimeRatio}
                style="percent"
                maximumFractionDigits={2}
              />
            </span>
            {entry.uptimeRank != null && (
              <span className="mt-0.5 block text-[10px] text-gray-400 dark:text-gray-500">
                <FormattedMessage
                  id="lines.uptime_rank_short"
                  defaultMessage="Rank #{rank}"
                  values={{ rank: entry.uptimeRank }}
                />
              </span>
            )}
          </span>
        )}
      </DirectoryValue>
    </article>
  );
}

function DirectoryValue({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={classNames(
        'min-w-0 text-gray-700 text-xs dark:text-gray-300',
        className,
      )}
    >
      <p className="mb-1 font-medium text-[10px] text-gray-400 uppercase tracking-wide lg:hidden dark:text-gray-500">
        {label}
      </p>
      {children}
    </div>
  );
}

function StatusLabel({ status }: { status: LineSummaryStatus }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 font-medium text-xs',
        {
          'text-disruption-light dark:text-disruption-dark':
            status === 'ongoing_disruption',
          'text-maintenance-light dark:text-maintenance-dark':
            status === 'ongoing_maintenance',
          'text-infra-light dark:text-infra-dark': status === 'ongoing_infra',
          'text-operational-light dark:text-operational-dark':
            status === 'normal',
          'text-gray-500 dark:text-gray-400':
            status === 'closed_for_day' || status === 'future_service',
        },
      )}
    >
      <span
        className={classNames('size-2 shrink-0 rounded-full', {
          'bg-disruption-light dark:bg-disruption-dark':
            status === 'ongoing_disruption',
          'bg-maintenance-light dark:bg-maintenance-dark':
            status === 'ongoing_maintenance',
          'bg-infra-light dark:bg-infra-dark': status === 'ongoing_infra',
          'bg-operational-light dark:bg-operational-dark': status === 'normal',
          'bg-gray-400 dark:bg-gray-500':
            status === 'closed_for_day' || status === 'future_service',
        })}
      />
      <FormattedMessage {...LineSummaryStatusLabels[status]} />
    </span>
  );
}
