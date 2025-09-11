import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
} from '@heroicons/react/16/solid';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { DateTime } from 'luxon';
import { DropdownMenu } from 'radix-ui';
import { useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedDateTimeRange,
  FormattedMessage,
} from 'react-intl';
import { Link, useNavigate } from 'react-router';
import { getIssuesHistoryYearMonth } from '~/client';
import { IssueCard } from '~/components/IssueCard';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '../../hooks/useHydrated';
import { assert } from '../../util/assert';
import type { Route } from './+types/route';

export async function loader({ params }: Route.LoaderArgs) {
  const rootUrl = process.env.ROOT_URL;

  const { year, month } = params;

  const { data, error } = await getIssuesHistoryYearMonth({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
    path: {
      year,
      month,
    },
  });
  if (error != null) {
    console.error('Error fetching issues for year-month:', error);
    throw new Response('Failed to fetch issues for year-month', {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
  assert(data != null);
  const { startAt, endAt, issuesByWeek } = data.data;
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
      id: 'site.title_history',
      defaultMessage: 'Incident History - {startAt, date, ::MMMM yyyy}',
    },
    {
      startAt: dateTimeStartAt.toMillis(),
    },
  );

  return { startAt, endAt, issuesByWeek, included, title, rootUrl };
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
  const { lang } = params;
  const { startAt, issuesByWeek, included } = loaderData;
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

  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
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
          <Link
            to={buildLocaleAwareLink(`/history/${dateTimeStartAt.year}`, lang)}
            className="hover:text-gray-700 dark:hover:text-gray-200"
          >
            {isHydrated ? (
              <FormattedDate
                value={dateTimeStartAt.toMillis()}
                year="numeric"
              />
            ) : (
              dateTimeStartAt.toFormat('yyyy')
            )}
          </Link>
          <ChevronRightIcon className="size-4" />
          <span className="text-gray-900 dark:text-gray-100">
            {isHydrated ? (
              <FormattedDate value={dateTimeStartAt.toMillis()} month="long" />
            ) : (
              dateTimeStartAt.toFormat('MMMM')
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
            <div className="flex grow items-center justify-center gap-x-2 sm:gap-x-4">
              <button
                type="button"
                className="rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-800"
              >
                <Link
                  to={buildLocaleAwareLink(
                    `/history/${dateTimeStartAt.minus({ month: 1 }).year}/${dateTimeStartAt
                      .minus({ month: 1 })
                      .toFormat('MM')}`,
                    lang,
                  )}
                >
                  <ArrowLeftIcon className="size-4" />
                </Link>
              </button>

              <div className="flex items-center justify-center gap-x-2 sm:min-w-64">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-bold text-base text-gray-900 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-lg dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600">
                    {isHydrated ? (
                      <FormattedDate
                        value={dateTimeStartAt.toMillis()}
                        month="long"
                      />
                    ) : (
                      dateTimeStartAt.toFormat('MMMM')
                    )}
                    <ChevronDownIcon className="size-4" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="z-50 max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-lg border border-gray-300 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                      sideOffset={5}
                    >
                      {monthOptions.map((monthOption) => (
                        <DropdownMenu.Item
                          key={monthOption}
                          className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-gray-900 text-sm outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-900 dark:text-gray-100 dark:data-[state=checked]:bg-blue-900 dark:data-[state=checked]:text-blue-100 dark:focus:bg-gray-700 dark:hover:bg-gray-700"
                          onSelect={() => {
                            navigate(
                              buildLocaleAwareLink(
                                `/history/${dateTimeStartAt.year}/${monthOption.toString().padStart(2, '0')}`,
                                lang,
                              ),
                            );
                          }}
                        >
                          {DateTime.fromObject({ month: monthOption }).toFormat(
                            'MMMM',
                          )}
                          {monthOption === dateTimeStartAt.month && (
                            <div className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
                          )}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-bold text-base text-gray-900 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-lg dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600">
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
                                `/history/${yearOption}/${dateTimeStartAt.toFormat('MM')}`,
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
                className="rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-50 dark:hover:bg-gray-800"
              >
                <Link
                  to={buildLocaleAwareLink(
                    `/history/${dateTimeStartAt.plus({ month: 1 }).year}/${dateTimeStartAt
                      .plus({ month: 1 })
                      .toFormat('MM')}`,
                    lang,
                  )}
                >
                  <ArrowRightIcon className="size-4" />
                </Link>
              </button>
            </div>
          </div>

          {issuesByWeek.map((issueGroup) => (
            <div key={issueGroup.week} className="flex flex-col gap-y-4">
              <h2 className="mb-4 border-gray-200 border-b pb-3 font-semibold text-gray-900 text-lg tracking-tight dark:border-gray-700 dark:text-gray-100">
                <FormattedDateTimeRange
                  from={DateTime.fromISO(issueGroup.week).toMillis()}
                  to={DateTime.fromISO(issueGroup.week)
                    .plus({ week: 1 })
                    .toMillis()}
                  dateStyle="long"
                />
              </h2>

              {issueGroup.issueIds.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 dark:border-gray-700 dark:bg-gray-800">
                  <div className="text-center text-gray-500 dark:text-gray-400">
                    <div className="mb-2 text-4xl">✨</div>
                    <p className="font-medium text-gray-600 dark:text-gray-300">
                      <FormattedMessage
                        id="history.no_incidents"
                        defaultMessage="No incidents"
                      />
                    </p>
                    <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
                      <FormattedMessage
                        id="history.no_incidents_description"
                        defaultMessage="All systems operated normally during this period"
                      />
                    </p>
                  </div>
                </div>
              )}

              {issueGroup.issueIds.map((issueId) => (
                <IssueCard
                  key={issueId}
                  issue={included.issues[issueId]}
                  className="!w-auto"
                  context={{
                    type: 'history.week',
                    date: issueGroup.week,
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Bottom pagination for mobile convenience */}
        <div className="flex items-center justify-center gap-x-3 border-gray-100 border-t pt-8 pb-4 dark:border-gray-800">
          <button
            type="button"
            className="rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Link
              to={buildLocaleAwareLink(
                `/history/${dateTimeStartAt.minus({ month: 1 }).year}/${dateTimeStartAt
                  .minus({ month: 1 })
                  .toFormat('MM')}`,
                lang,
              )}
            >
              <ArrowLeftIcon className="size-4" />
            </Link>
          </button>

          <div className="flex min-w-52 items-center justify-center gap-x-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 font-medium text-gray-700 text-sm shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                {isHydrated ? (
                  <FormattedDate
                    value={dateTimeStartAt.toMillis()}
                    month="long"
                  />
                ) : (
                  dateTimeStartAt.toFormat('MMMM')
                )}
                <ChevronDownIcon className="size-3" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="z-50 max-h-64 overflow-y-auto rounded-lg border border-gray-300 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                  sideOffset={5}
                >
                  {monthOptions.map((monthOption) => (
                    <DropdownMenu.Item
                      key={monthOption}
                      className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-gray-900 text-sm outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-900 dark:text-gray-100 dark:data-[state=checked]:bg-blue-900 dark:data-[state=checked]:text-blue-100 dark:focus:bg-gray-700 dark:hover:bg-gray-700"
                      onSelect={() => {
                        navigate(
                          buildLocaleAwareLink(
                            `/history/${dateTimeStartAt.year}/${monthOption.toString().padStart(2, '0')}`,
                            lang,
                          ),
                        );
                      }}
                    >
                      {DateTime.fromObject({ month: monthOption }).toFormat(
                        'MMMM',
                      )}
                      {monthOption === dateTimeStartAt.month && (
                        <div className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
                      )}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 font-medium text-gray-700 text-sm shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                {isHydrated ? (
                  <FormattedDate
                    value={dateTimeStartAt.toMillis()}
                    year="numeric"
                  />
                ) : (
                  dateTimeStartAt.toFormat('yyyy')
                )}
                <ChevronDownIcon className="size-3" />
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
                          buildLocaleAwareLink(
                            `/history/${yearOption}/${dateTimeStartAt.toFormat('MM')}`,
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
            className="rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Link
              to={buildLocaleAwareLink(
                `/history/${dateTimeStartAt.plus({ month: 1 }).year}/${dateTimeStartAt
                  .plus({ month: 1 })
                  .toFormat('MM')}`,
                lang,
              )}
            >
              <ArrowRightIcon className="size-4" />
            </Link>
          </button>
        </div>
      </div>
    </IncludedEntitiesContext.Provider>
  );
};

export default HistoryPage;
