import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
} from '@heroicons/react/16/solid';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { ExclamationCircleIcon } from '@heroicons/react/24/solid';
import { DateTime } from 'luxon';
import { DropdownMenu } from 'radix-ui';
import { useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedMessage,
  FormattedNumber,
} from 'react-intl';
import { Link, useNavigate } from 'react-router';
import { getIssuesHistoryYearSummary } from '~/client';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '../../hooks/useHydrated';
import { assert } from '../../util/assert';
import type { Route } from './+types/route';

export async function loader({ params }: Route.LoaderArgs) {
  const rootUrl = process.env.ROOT_URL;

  const { year } = params;

  const { data, error } = await getIssuesHistoryYearSummary({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
    path: {
      year,
    },
  });
  if (error != null) {
    console.error('Error fetching issues for year:', error);
    throw new Response('Failed to fetch issues for year', {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
  assert(data != null);
  const { startAt, endAt, summaryByMonth } = data.data;
  const { included } = data;

  const { lang = 'en-SG' } = params;
  const { default: messages } = await import(`../../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const dateTimeStartAt = DateTime.fromISO(startAt).setZone('Asia/Singapore');

  const title = intl.formatMessage(
    {
      id: 'site.title_history_year',
      defaultMessage: 'Incident History - {startAt, date, ::yyyy}',
    },
    {
      startAt: dateTimeStartAt.toMillis(),
    },
  );

  return { startAt, endAt, summaryByMonth, included, title, rootUrl };
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ data, location }) => {
  const { title, rootUrl } = data;

  const ogUrl = new URL(location.pathname, rootUrl).toString();
  const ogImage = new URL('/og_image.png', rootUrl).toString();

  return [
    {
      title,
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
      property: 'og:url',
      content: ogUrl,
    },
    {
      property: 'og:image',
      content: ogImage,
    },
  ];
};

const HistoryPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData, params } = props;
  const { lang, year } = params;
  const { startAt, summaryByMonth, included } = loaderData;
  const navigate = useNavigate();

  const dateTimeStartAt = useMemo(() => {
    return DateTime.fromISO(startAt).setZone('Asia/Singapore');
  }, [startAt]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 2010;
    const years = [];
    for (let y = currentYear; y >= startYear; y--) {
      years.push(y);
    }
    return years;
  }, []);

  const isHydrated = useHydrated();

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col space-y-8">
        <nav className="flex items-center space-x-1 text-gray-500 text-sm dark:text-gray-400">
          <Link
            to={buildLocaleAwareLink('/', lang)}
            className="hover:text-gray-700 dark:hover:text-gray-200"
          >
            <FormattedMessage id="general.home" defaultMessage="Home" />
          </Link>
          <ChevronRightIcon className="size-4" />
          <Link
            to={buildLocaleAwareLink('/history', lang)}
            className="hover:text-gray-700 dark:hover:text-gray-200"
          >
            <FormattedMessage id="general.history" defaultMessage="History" />
          </Link>
          <ChevronRightIcon className="size-4" />
          <span className="text-gray-900 dark:text-gray-100">
            {isHydrated ? (
              <FormattedDate
                value={dateTimeStartAt.toMillis()}
                year="numeric"
              />
            ) : (
              dateTimeStartAt.toFormat('yyyy')
            )}
          </span>
        </nav>
        <header className="space-y-2 text-center">
          <h1 className="font-bold text-2xl text-gray-900 leading-tight sm:text-3xl dark:text-gray-100">
            <FormattedMessage id="general.history" defaultMessage="History" />
          </h1>
          <p className="mx-auto max-w-2xl text-base text-gray-600 leading-normal dark:text-gray-400">
            <FormattedMessage
              id="site.history.subtitle"
              defaultMessage="Past service disruptions and maintenance events"
            />
          </p>
        </header>

        <div className="flex flex-col gap-y-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-md dark:border-gray-600 dark:bg-gray-800">
            <div className="flex grow items-center justify-center gap-x-4">
              <button
                type="button"
                className="rounded-lg p-3 text-gray-700 transition-all hover:bg-white hover:shadow-md disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-600"
                aria-label="Previous year"
              >
                <Link
                  to={buildLocaleAwareLink(
                    `/history/${dateTimeStartAt.minus({ year: 1 }).year}`,
                    lang,
                  )}
                >
                  <ArrowLeftIcon className="size-5" />
                </Link>
              </button>

              <div className="flex min-w-48 flex-col items-center">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-bold text-gray-900 text-lg shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600">
                    {isHydrated ? (
                      <FormattedDate
                        value={dateTimeStartAt.toMillis()}
                        year="numeric"
                      />
                    ) : (
                      dateTimeStartAt.toFormat('yyyy')
                    )}
                    <ChevronDownIcon className="size-4" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="z-50 max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-lg border border-gray-300 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                      sideOffset={5}
                    >
                      {yearOptions.map((yearOption) => (
                        <DropdownMenu.Item
                          key={yearOption}
                          className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-gray-900 text-sm outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-900 dark:text-gray-100 dark:data-[state=checked]:bg-blue-900 dark:data-[state=checked]:text-blue-100 dark:focus:bg-gray-700 dark:hover:bg-gray-700"
                          onSelect={() => {
                            navigate(
                              buildLocaleAwareLink(
                                `/history/${yearOption}`,
                                lang,
                              ),
                            );
                          }}
                        >
                          {yearOption}
                          {yearOption === dateTimeStartAt.year && (
                            <div className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
                          )}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>

              <button
                type="button"
                className="rounded-lg p-3 text-gray-700 transition-all hover:bg-white hover:shadow-md disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-600"
                aria-label="Next year"
              >
                <Link
                  to={buildLocaleAwareLink(
                    `/history/${dateTimeStartAt.plus({ year: 1 }).year}`,
                    lang,
                  )}
                >
                  <ArrowRightIcon className="size-5" />
                </Link>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {summaryByMonth.map((monthSummary) => (
              <div
                key={monthSummary.month}
                className="group hover:-translate-y-1 relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-gray-600 dark:from-gray-800 dark:to-gray-900"
              >
                <div className="absolute top-0 right-0 h-12 w-12 rounded-bl-full bg-gradient-to-br from-blue-500/10 to-purple-500/10" />
                <h2 className="relative mb-4 font-bold text-gray-900 text-lg tracking-tight dark:text-gray-100">
                  <FormattedDate
                    value={monthSummary.month}
                    year="numeric"
                    month="long"
                  />
                </h2>

                <div className="mb-4 rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 dark:border-blue-800/30 dark:from-blue-900/20 dark:to-indigo-900/20">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-blue-500 p-1.5">
                      <ExclamationCircleIcon className="size-4 text-white" />
                    </div>
                    <span className="font-medium text-blue-900 text-sm dark:text-blue-100">
                      <FormattedMessage
                        id="general.issues_with_count"
                        defaultMessage="Issues ({count})"
                        values={{
                          count: monthSummary.totalCount,
                        }}
                      />
                    </span>
                  </div>
                </div>

                <div className="mb-4 grow space-y-2">
                  {(monthSummary.issueCountsByType.disruption ?? 0) > 0 && (
                    <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2.5 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full bg-disruption-light dark:bg-disruption-dark" />
                        <span className="font-medium text-gray-700 text-xs dark:text-gray-300">
                          <FormattedMessage
                            id="general.disruption"
                            defaultMessage="Disruption"
                          />
                        </span>
                      </div>
                      <span className="font-semibold text-gray-900 text-xs dark:text-gray-100">
                        <FormattedNumber
                          value={monthSummary.issueCountsByType.disruption ?? 0}
                        />
                      </span>
                    </div>
                  )}
                  {(monthSummary.issueCountsByType.maintenance ?? 0) > 0 && (
                    <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2.5 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full bg-maintenance-light dark:bg-maintenance-dark" />
                        <span className="font-medium text-gray-700 text-xs dark:text-gray-300">
                          <FormattedMessage
                            id="general.maintenance"
                            defaultMessage="Maintenance"
                          />
                        </span>
                      </div>
                      <span className="font-semibold text-gray-900 text-xs dark:text-gray-100">
                        <FormattedNumber
                          value={
                            monthSummary.issueCountsByType.maintenance ?? 0
                          }
                        />
                      </span>
                    </div>
                  )}
                  {(monthSummary.issueCountsByType.infra ?? 0) > 0 && (
                    <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2.5 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700">
                      <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full bg-infra-light dark:bg-infra-dark" />
                        <span className="font-medium text-gray-700 text-xs dark:text-gray-300">
                          <FormattedMessage
                            id="general.infrastructure"
                            defaultMessage="Infrastructure"
                          />
                        </span>
                      </div>
                      <span className="font-semibold text-gray-900 text-xs dark:text-gray-100">
                        <FormattedNumber
                          value={monthSummary.issueCountsByType.infra ?? 0}
                        />
                      </span>
                    </div>
                  )}
                </div>

                <Link
                  to={buildLocaleAwareLink(
                    `/history/${year}/${DateTime.fromISO(monthSummary.month).toFormat('MM')}`,
                    lang,
                  )}
                  className="group hover:-translate-y-0.5 inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 font-medium text-sm text-white shadow-lg transition-all duration-200 hover:from-blue-700 hover:to-blue-800 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:from-blue-500 dark:to-blue-600 dark:focus:ring-offset-gray-800 dark:hover:from-blue-600 dark:hover:to-blue-700"
                >
                  <FormattedMessage
                    id="general.view_details"
                    defaultMessage="View Details"
                  />
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom pagination for mobile convenience */}
        <div className="flex items-center justify-center gap-x-6 border-gray-200 border-t pt-12 pb-8 dark:border-gray-700">
          <button
            type="button"
            className="rounded-lg p-3 text-gray-600 transition-all hover:bg-gray-100 hover:shadow-sm disabled:pointer-events-none disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Previous year"
          >
            <Link
              to={buildLocaleAwareLink(
                `/history/${dateTimeStartAt.minus({ year: 1 }).year}`,
                lang,
              )}
            >
              <ArrowLeftIcon className="size-5" />
            </Link>
          </button>

          <div className="flex min-w-48 flex-col items-center">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-semibold text-gray-900 text-lg shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600">
                {isHydrated ? (
                  <FormattedDate
                    value={dateTimeStartAt.toMillis()}
                    year="numeric"
                  />
                ) : (
                  dateTimeStartAt.toFormat('yyyy')
                )}
                <ChevronDownIcon className="size-4" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="z-50 max-h-64 overflow-y-auto rounded-lg border border-gray-300 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                  sideOffset={5}
                >
                  {yearOptions.map((yearOption) => (
                    <DropdownMenu.Item
                      key={yearOption}
                      className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-gray-900 text-sm outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-900 dark:text-gray-100 dark:data-[state=checked]:bg-blue-900 dark:data-[state=checked]:text-blue-100 dark:focus:bg-gray-700 dark:hover:bg-gray-700"
                      onSelect={() => {
                        navigate(
                          buildLocaleAwareLink(`/history/${yearOption}`, lang),
                        );
                      }}
                    >
                      {yearOption}
                      {yearOption === dateTimeStartAt.year && (
                        <div className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
                      )}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          <button
            type="button"
            className="rounded-lg p-3 text-gray-600 transition-all hover:bg-gray-100 hover:shadow-sm disabled:pointer-events-none disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Next year"
          >
            <Link
              to={buildLocaleAwareLink(
                `/history/${dateTimeStartAt.plus({ year: 1 }).year}`,
                lang,
              )}
            >
              <ArrowRightIcon className="size-5" />
            </Link>
          </button>
        </div>
      </div>
    </IncludedEntitiesContext.Provider>
  );
};

export default HistoryPage;
