import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
} from '@heroicons/react/16/solid';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import { DropdownMenu } from 'radix-ui';
import { useMemo } from 'react';
import {
  createIntl,
  FormattedDate,
  FormattedDateTimeRange,
  FormattedMessage,
} from 'react-intl';
import { IssueCard } from '~/components/IssueCard';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { buildSeoMetadata } from '~/helpers/seo';
import { useHydrated } from '~/hooks/useHydrated';
import {
  getIssuesHistoryYearMonthFn,
  parseHistoryYearMonthParams,
} from '~/util/history.functions';
import {
  getHistoryNavigationYearOptions,
  HISTORY_YEAR_BOUNDS,
  isHistoryYearInBounds,
} from '~/util/historyYearBounds';

export const Route = createFileRoute('/{-$lang}/history/$year/$month/')({
  component: HistoryMonthPage,
  loader: ({ params }) => {
    const parsedParams = parseHistoryYearMonthParams(params.year, params.month);
    if (parsedParams == null) {
      throw notFound();
    }

    return getIssuesHistoryYearMonthFn({
      data: parsedParams,
    });
  },
  async head(ctx) {
    if (ctx.loaderData == null) {
      return {
        meta: [],
      };
    }

    const { lang = 'en-SG', year, month } = ctx.params;
    const { default: messages } = await import(
      `../../../../../../lang/${lang}.json`
    );

    const intl = createIntl({
      locale: lang,
      messages,
    });

    const startAt = ctx.loaderData?.data.startAt ?? `${year}-${month}-01`;
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
    const description = intl.formatMessage(
      {
        id: 'site.history.month_description',
        defaultMessage:
          'Past service disruptions and maintenance events in {startAt, date, ::MMMM yyyy}.',
      },
      {
        startAt: dateTimeStartAt.toMillis(),
      },
    );

    const rootUrl = import.meta.env.VITE_ROOT_URL;

    const seo = buildSeoMetadata({
      lang,
      path: `/history/${year}/${month}`,
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
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:url',
          content: seo.ogUrl,
        },
        {
          property: 'og:image',
          content: seo.ogImage,
        },
      ],
    };
  },
});

function HistoryMonthPage() {
  const loaderData = Route.useLoaderData();
  const { data, included } = loaderData;
  const { startAt, issuesByWeek } = data;
  const navigate = Route.useNavigate();

  const dateTimeStartAt = useMemo(() => {
    return DateTime.fromISO(startAt).setZone('Asia/Singapore');
  }, [startAt]);

  const yearOptions = getHistoryNavigationYearOptions();
  const previousMonthDateTime = dateTimeStartAt.minus({ month: 1 });
  const nextMonthDateTime = dateTimeStartAt.plus({ month: 1 });
  const canNavigateToPreviousMonth = isHistoryYearInBounds(
    previousMonthDateTime.year,
    HISTORY_YEAR_BOUNDS,
  );
  const canNavigateToNextMonth = isHistoryYearInBounds(
    nextMonthDateTime.year,
    HISTORY_YEAR_BOUNDS,
  );

  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, []);

  const isHydrated = useHydrated();

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col space-y-8">
        <nav className="flex items-center space-x-1 text-gray-500 text-sm dark:text-gray-400">
          <Link
            to="/{-$lang}"
            className="hover:text-gray-700 dark:hover:text-gray-200"
          >
            <FormattedMessage id="general.home" defaultMessage="Home" />
          </Link>
          <ChevronRightIcon className="size-4" />
          <Link
            to="/{-$lang}/history"
            className="hover:text-gray-700 dark:hover:text-gray-200"
          >
            <FormattedMessage id="general.history" defaultMessage="History" />
          </Link>
          <ChevronRightIcon className="size-4" />
          <Link
            to="/{-$lang}/history/$year"
            params={{ year: dateTimeStartAt.year.toString() }}
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
        <header className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-bold text-gray-900 text-xl leading-tight sm:text-2xl dark:text-gray-100">
            <FormattedMessage id="general.history" defaultMessage="History" />
          </h1>
          <p className="mx-auto max-w-2xl text-gray-600 text-xs leading-4 sm:text-sm sm:leading-5 dark:text-gray-400">
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
                disabled={!canNavigateToPreviousMonth}
              >
                {canNavigateToPreviousMonth ? (
                  <Link
                    to="/{-$lang}/history/$year/$month"
                    params={{
                      year: previousMonthDateTime.year.toString(),
                      month: previousMonthDateTime.toFormat('MM'),
                    }}
                  >
                    <ArrowLeftIcon className="size-4" />
                  </Link>
                ) : (
                  <ArrowLeftIcon className="size-4" />
                )}
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
                            navigate({
                              to: '/{-$lang}/history/$year/$month',
                              params: {
                                year: dateTimeStartAt.year.toString(),
                                month: monthOption.toString().padStart(2, '0'),
                              },
                            });
                          }}
                        >
                          {isHydrated ? (
                            <FormattedDate
                              value={DateTime.fromObject({
                                year: dateTimeStartAt.year,
                                month: monthOption,
                              }).toMillis()}
                              month="long"
                            />
                          ) : (
                            monthOption.toString().padStart(2, '0')
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
                            navigate({
                              to: '/{-$lang}/history/$year/$month',
                              params: {
                                year: yearOption.toString(),
                                month: dateTimeStartAt.toFormat('MM'),
                              },
                            });
                          }}
                        >
                          {isHydrated ? (
                            <FormattedDate
                              value={yearOption.toString()}
                              year="numeric"
                            />
                          ) : (
                            yearOption.toString()
                          )}
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
                disabled={!canNavigateToNextMonth}
              >
                {canNavigateToNextMonth ? (
                  <Link
                    to="/{-$lang}/history/$year/$month"
                    params={{
                      year: nextMonthDateTime.year.toString(),
                      month: nextMonthDateTime.toFormat('MM'),
                    }}
                  >
                    <ArrowRightIcon className="size-4" />
                  </Link>
                ) : (
                  <ArrowRightIcon className="size-4" />
                )}
              </button>
            </div>
          </div>

          {issuesByWeek.map((issueGroup) => (
            <div key={issueGroup.week} className="flex flex-col gap-y-4">
              <h2 className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 border-gray-200 border-b pb-3 font-semibold text-gray-900 text-lg tracking-tight dark:border-gray-700 dark:text-gray-100">
                <span>
                  <FormattedDateTimeRange
                    from={DateTime.fromISO(issueGroup.week).toMillis()}
                    to={DateTime.fromISO(issueGroup.week)
                      .plus({ week: 1 })
                      .toMillis()}
                    dateStyle="long"
                  />
                </span>
                <HistoryWeekRelativeIndicator
                  isHydrated={isHydrated}
                  week={issueGroup.week}
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
            disabled={!canNavigateToPreviousMonth}
          >
            {canNavigateToPreviousMonth ? (
              <Link
                to="/{-$lang}/history/$year/$month"
                params={{
                  year: previousMonthDateTime.year.toString(),
                  month: previousMonthDateTime.toFormat('MM'),
                }}
              >
                <ArrowLeftIcon className="size-4" />
              </Link>
            ) : (
              <ArrowLeftIcon className="size-4" />
            )}
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
                        navigate({
                          to: '/{-$lang}/history/$year/$month',
                          params: {
                            year: dateTimeStartAt.year.toString(),
                            month: monthOption.toString().padStart(2, '0'),
                          },
                        });
                      }}
                    >
                      {isHydrated ? (
                        <FormattedDate
                          value={DateTime.fromObject({
                            year: dateTimeStartAt.year,
                            month: monthOption,
                          }).toMillis()}
                          month="long"
                        />
                      ) : (
                        monthOption.toString().padStart(2, '0')
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
                        navigate({
                          to: '/{-$lang}/history/$year/$month',
                          params: {
                            year: yearOption.toString(),
                            month: dateTimeStartAt.toFormat('MM'),
                          },
                        });
                      }}
                    >
                      {isHydrated ? (
                        <FormattedDate
                          value={yearOption.toString()}
                          year="numeric"
                        />
                      ) : (
                        yearOption.toString()
                      )}
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
            disabled={!canNavigateToNextMonth}
          >
            {canNavigateToNextMonth ? (
              <Link
                to="/{-$lang}/history/$year/$month"
                params={{
                  year: nextMonthDateTime.year.toString(),
                  month: nextMonthDateTime.toFormat('MM'),
                }}
              >
                <ArrowRightIcon className="size-4" />
              </Link>
            ) : (
              <ArrowRightIcon className="size-4" />
            )}
          </button>
        </div>
      </div>
    </IncludedEntitiesContext.Provider>
  );
}

function HistoryWeekRelativeIndicator({
  isHydrated,
  week,
}: {
  isHydrated: boolean;
  week: string;
}) {
  if (!isHydrated) {
    return null;
  }

  const weekOffset = getHistoryWeekOffsetFromCurrentWeek(week);

  if (weekOffset == null) {
    return null;
  }

  return (
    <span
      className={classNames(
        'shrink-0 rounded-full px-2.5 py-1 font-medium text-xs tracking-normal',
        {
          'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300':
            weekOffset < 0,
          'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200':
            weekOffset === 0,
          'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200':
            weekOffset > 0,
        },
      )}
    >
      {weekOffset === 0 ? (
        <FormattedMessage
          id="history.week_relative_this"
          defaultMessage="This Week"
        />
      ) : weekOffset === -1 ? (
        <FormattedMessage
          id="history.week_relative_last"
          defaultMessage="Last Week"
        />
      ) : weekOffset === 1 ? (
        <FormattedMessage
          id="history.week_relative_next"
          defaultMessage="Next Week"
        />
      ) : weekOffset < 0 ? (
        <FormattedMessage
          id="history.week_relative_ago"
          defaultMessage="{count, plural, one {# week ago} other {# weeks ago}}"
          values={{ count: Math.abs(weekOffset) }}
        />
      ) : (
        <FormattedMessage
          id="history.week_relative_later"
          defaultMessage="in {count, plural, one {# week} other {# weeks}}"
          values={{ count: weekOffset }}
        />
      )}
    </span>
  );
}

function getHistoryWeekOffsetFromCurrentWeek(week: string) {
  const weekStart = DateTime.fromISO(week, {
    zone: 'Asia/Singapore',
  }).startOf('week');

  if (!weekStart.isValid) {
    return null;
  }

  const currentWeekStart = DateTime.now()
    .setZone('Asia/Singapore')
    .startOf('week');

  return Math.round(weekStart.diff(currentWeekStart, 'weeks').weeks);
}
