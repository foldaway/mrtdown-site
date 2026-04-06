import { LinkIcon } from '@heroicons/react/16/solid';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { ClockIcon } from '@heroicons/react/24/solid';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  useHydrated,
  useRouterState,
} from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import { DropdownMenu } from 'radix-ui';
import { useMemo } from 'react';
import { FormattedDate, FormattedMessage, IntlProvider } from 'react-intl';
import { LocaleSwitcher } from '~/components/LocaleSwitcher';
import Spinner from '~/components/Spinner';
import { LANGUAGES } from '~/constants';
import { getRootFn } from '~/util/root.functions';

export const Route = createFileRoute('/{-$lang}')({
  component: RouteComponent,
  loader: ({ params }) => {
    const lang = params.lang ?? 'en-SG';
    if (!LANGUAGES.includes(lang)) {
      throw notFound();
    }
    return getRootFn({ data: { lang: params.lang } });
  },
});

const queryClient = new QueryClient();

const linkClassName = classNames(
  'relative text-center rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ease-in-out',
  'text-gray-700 dark:text-gray-300 hover:text-white dark:hover:text-white hover:bg-accent-light dark:hover:bg-accent-light',
  '[&.active]:bg-accent-light [&.active]:text-white [&.active]:shadow-md [&.active]:shadow-accent-light/25 [&.active]:hover:bg-accent-dark [&.active]:hover:shadow-lg [&.active]:hover:shadow-accent-light/30 [&.active]:transform [&.active]:hover:-translate-y-0.5',
);

const linkClassNameMobile = classNames(
  'group flex w-full items-center rounded-xl px-4 py-3 font-medium text-sm outline-none transition-all duration-200 ease-out',
  'text-gray-700 hover:bg-gradient-to-r hover:from-accent-light/10 hover:to-accent-light/5 hover:text-accent-light focus:bg-gradient-to-r focus:from-accent-light/10 focus:to-accent-light/5 focus:text-accent-light data-[highlighted]:bg-gradient-to-r data-[highlighted]:from-accent-light/10 data-[highlighted]:to-accent-light/5 data-[highlighted]:text-accent-light dark:text-gray-300 dark:data-[highlighted]:bg-gradient-to-r dark:data-[highlighted]:from-accent-light/20 dark:data-[highlighted]:to-accent-light/10 dark:data-[highlighted]:text-accent-light dark:focus:bg-gradient-to-r dark:focus:from-accent-light/20 dark:focus:to-accent-light/10 dark:focus:text-accent-light dark:hover:bg-gradient-to-r dark:hover:from-accent-light/20 dark:hover:to-accent-light/10 dark:hover:text-accent-light',
  '[&.active]:bg-gradient-to-r [&.active]:from-accent-light [&.active]:to-accent-dark [&.active]:text-white [&.active]:shadow-accent-light/30 [&.active]:shadow-lg',
);

function RouteComponent() {
  const { lang = 'en-SG' } = Route.useParams();
  const loaderData = Route.useLoaderData();

  const {
    messages,
    lineIds,
    included,
    metadata,
    operatorIds,
    operatorsIncluded,
  } = loaderData;

  const isHydrated = useHydrated();

  const isNavigating = useRouterState({
    select: (state) => state.status === 'pending',
  });

  const lastUpdatedAt = useMemo(() => {
    if (metadata.length === 0) return null;
    return (
      metadata.find((item) => item.key === 'db_generated_at')?.value ?? null
    );
  }, [metadata]);

  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale={lang ?? 'en-SG'} messages={messages}>
        <header className="sticky top-0 z-50 w-full border-gray-200/20 border-b bg-white/80 shadow-black/5 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 dark:border-gray-800/30 dark:bg-gray-950/80 dark:shadow-white/5 dark:supports-[backdrop-filter]:bg-gray-950/70">
          <div className="mx-4 max-w-5xl lg:mx-auto">
            <div className="flex h-18 items-center justify-between">
              <div className="flex items-center space-x-6">
                <Link
                  to="/{-$lang}"
                  className="group flex items-center space-x-3 transition-transform duration-200 hover:scale-105"
                >
                  <div className="relative">
                    <img
                      src="/android-chrome-192x192.png"
                      alt="mrtdown logo"
                      className="size-10 drop-shadow-sm"
                    />
                    <div className="-inset-1 absolute rounded-lg bg-gradient-to-r from-blue-500 to-green-500 opacity-0 blur transition-opacity group-hover:opacity-20" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-2xl text-gray-900 italic leading-tight transition-colors group-hover:text-accent-light dark:text-gray-100 dark:group-hover:text-accent-light">
                      mrtdown
                    </span>
                  </div>
                </Link>
              </div>

              <nav className="flex items-center space-x-1">
                <div className="hidden md:flex md:items-center md:space-x-1">
                  <Link
                    to="/{-$lang}"
                    className={linkClassName}
                    activeOptions={{ exact: true }}
                  >
                    <FormattedMessage id="general.home" defaultMessage="Home" />
                  </Link>
                  <Link to="/{-$lang}/history" className={linkClassName}>
                    <FormattedMessage
                      id="general.history"
                      defaultMessage="History"
                    />
                  </Link>
                  <Link to="/{-$lang}/statistics" className={linkClassName}>
                    <FormattedMessage
                      id="general.statistics"
                      defaultMessage="Statistics"
                    />
                  </Link>
                  <Link to="/{-$lang}/system-map" className={linkClassName}>
                    <FormattedMessage
                      id="general.system_map"
                      defaultMessage="System Map"
                    />
                  </Link>
                  <Link to="/{-$lang}/about" className={linkClassName}>
                    <FormattedMessage
                      id="general.about"
                      defaultMessage="About"
                    />
                  </Link>
                </div>

                <div className="md:hidden">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        className="group relative inline-flex items-center justify-center rounded-xl bg-gray-50/50 p-3 text-gray-600 transition-all duration-200 hover:bg-accent-light/10 hover:text-accent-light hover:shadow-accent-light/20 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-2 active:scale-95 dark:bg-gray-800/50 dark:text-gray-400 dark:hover:bg-accent-light/20 dark:hover:text-accent-light"
                      >
                        <span className="sr-only">Open main menu</span>
                        <div className="relative">
                          <Bars3Icon className="size-6 transition-transform duration-200 group-hover:scale-110" />
                        </div>
                      </button>
                    </DropdownMenu.Trigger>

                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[220px] rounded-2xl border border-gray-200/40 bg-white/98 p-1.5 shadow-black/10 shadow-xl backdrop-blur-xl data-[state=closed]:animate-out data-[state=open]:animate-in dark:border-gray-700/40 dark:bg-gray-950/98 dark:shadow-white/5"
                        align="end"
                        sideOffset={12}
                      >
                        <DropdownMenu.Item>
                          <Link
                            to="/{-$lang}"
                            className={linkClassNameMobile}
                            // end
                          >
                            <FormattedMessage
                              id="general.home"
                              defaultMessage="Home"
                            />
                          </Link>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item>
                          <Link
                            to="/{-$lang}/history"
                            className={linkClassNameMobile}
                          >
                            <FormattedMessage
                              id="general.history"
                              defaultMessage="History"
                            />
                          </Link>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item>
                          <Link
                            to="/{-$lang}/statistics"
                            className={linkClassNameMobile}
                          >
                            <FormattedMessage
                              id="general.statistics"
                              defaultMessage="Statistics"
                            />
                          </Link>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item>
                          <Link
                            to="/{-$lang}/system-map"
                            className={linkClassNameMobile}
                          >
                            <FormattedMessage
                              id="general.system_map"
                              defaultMessage="System Map"
                            />
                          </Link>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item>
                          <Link
                            to="/{-$lang}/about"
                            className={linkClassNameMobile}
                          >
                            <FormattedMessage
                              id="general.about"
                              defaultMessage="About"
                            />
                          </Link>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              </nav>
            </div>
          </div>
        </header>
        <main className="mx-4 mt-6 flex max-w-5xl flex-col bg-gray-50 sm:mt-8 lg:mx-auto dark:bg-gray-900">
          <Outlet />

          {isNavigating && isHydrated && (
            <div className="fixed right-4 bottom-4">
              <Spinner size="medium" />
            </div>
          )}
        </main>
        <footer className="mt-8 border-gray-800 border-t bg-gray-900 text-gray-300">
          <div className="mx-auto max-w-7xl px-8 py-12">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
              {/* Brand Section */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <img
                    src="/android-chrome-192x192.png"
                    alt="Site favicon"
                    className="size-8"
                  />
                  {/* <Train className="h-8 w-8 text-blue-400" /> */}
                  <span className="font-bold text-2xl text-white">mrtdown</span>
                </div>
                <p className="max-w-xs text-gray-400 text-sm">
                  <FormattedMessage
                    id="site.tagline"
                    defaultMessage="community-run transit monitoring"
                  />
                </p>
                <div className="flex space-x-4">
                  <a
                    href="https://github.com/foldaway/mrtdown-site"
                    className="text-gray-400 transition-colors hover:text-blue-400"
                  >
                    <LinkIcon className="h-5 w-5" />
                    <span className="sr-only">GitHub</span>
                  </a>
                </div>
              </div>

              {/* Line Status Links */}
              <div>
                <h3 className="mb-4 font-semibold text-sm text-white uppercase tracking-wider">
                  <FormattedMessage
                    id="footer.line_status"
                    defaultMessage="Line status"
                  />
                </h3>
                <ul className="space-y-3">
                  {lineIds.map((lineId) => {
                    const line = included.lines[lineId];

                    return (
                      <li key={lineId}>
                        <Link
                          to="/{-$lang}/lines/$lineId"
                          params={{ lineId }}
                          className="flex items-center gap-x-1.5 text-sm transition-colors hover:text-accent-light"
                        >
                          <span
                            className="rounded-sm px-2 py-1 font-semibold text-white text-xs leading-none"
                            style={{ backgroundColor: line.color }}
                          >
                            {line.id}
                          </span>
                          {line.titleTranslations[lang ?? 'en-SG'] ??
                            line.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Quick Access & Operators */}
              <div className="flex flex-col gap-8">
                {/* Quick Access */}
                <div>
                  <h3 className="mb-4 font-semibold text-sm text-white uppercase tracking-wider">
                    <FormattedMessage
                      id="footer.quick_access"
                      defaultMessage="Quick Access"
                    />
                  </h3>
                  <ul className="space-y-3">
                    <li>
                      <Link
                        to="/{-$lang}/history"
                        className="flex text-sm transition-colors hover:text-accent-light"
                      >
                        <FormattedMessage
                          id="general.history"
                          defaultMessage="History"
                        />
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/{-$lang}/system-map"
                        className="flex text-sm transition-colors hover:text-accent-light"
                      >
                        <FormattedMessage
                          id="general.system_map"
                          defaultMessage="System Map"
                        />
                      </Link>
                    </li>
                    {/*{footerManifest.featuredStations.map((station) => (
                      <li key={station.id}>
                        <Link
                          to="/{-$lang}/stations/$stationId"
                          params={{ stationId: station.id }}
                          className="flex text-sm transition-colors hover:text-blue-400"
                        >
                          {station.name_translations[lang ?? 'en-SG'] ??
                            station.name}
                        </Link>
                      </li>
                    ))}*/}
                  </ul>
                </div>

                {/* Operators */}
                <div>
                  <h3 className="mb-4 font-semibold text-sm text-white uppercase tracking-wider">
                    <FormattedMessage
                      id="footer.operators"
                      defaultMessage="Operators"
                    />
                  </h3>
                  <ul className="space-y-3">
                    {operatorIds.map((operatorId) => {
                      const operator = operatorsIncluded[operatorId];

                      return (
                        <li key={operatorId}>
                          <Link
                            to="/{-$lang}/operators/$operatorId"
                            params={{ operatorId }}
                            className="flex text-sm transition-colors hover:text-accent-light"
                          >
                            {operator?.nameTranslations[lang ?? 'en-SG'] ??
                              operator?.name ??
                              operatorId}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* Community */}
              <div>
                <h3 className="mb-4 font-semibold text-sm text-white uppercase tracking-wider">
                  <FormattedMessage
                    id="general.community"
                    defaultMessage="Community"
                  />
                </h3>
                <ul className="space-y-3">
                  <li>
                    <Link
                      to="/{-$lang}/about"
                      className="flex text-sm transition-colors hover:text-accent-light"
                    >
                      <FormattedMessage
                        id="general.about"
                        defaultMessage="About"
                      />
                    </Link>
                  </li>
                  <li>
                    <a
                      href="https://github.com/foldaway/mrtdown-data"
                      className="text-sm transition-colors hover:text-accent-light"
                    >
                      <FormattedMessage
                        id="footer.contribute_data"
                        defaultMessage="Contribute Data"
                      />
                    </a>
                  </li>
                </ul>

                {/* Language Selector */}
                <div className="mt-6 border-gray-800 border-t pt-4">
                  <h4 className="mb-3 font-semibold text-white text-xs uppercase tracking-wider">
                    <FormattedMessage
                      id="general.language"
                      defaultMessage="Language"
                    />
                  </h4>
                  <LocaleSwitcher />
                </div>

                {/* Quick Stats */}
                {lastUpdatedAt != null && (
                  <div className="mt-6 border-gray-800 border-t pt-4">
                    <div className="flex items-center space-x-2 text-gray-400 text-xs">
                      <ClockIcon className="h-3 w-3" />
                      <span>
                        <FormattedMessage
                          id="footer.last_updated"
                          defaultMessage="Last updated {lastUpdatedAt}"
                          values={{
                            lastUpdatedAt: isHydrated ? (
                              <FormattedDate
                                value={lastUpdatedAt}
                                dateStyle="medium"
                                timeStyle="short"
                              />
                            ) : (
                              lastUpdatedAt
                            ),
                          }}
                        />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Section */}
            <div className="mt-12 border-gray-800 border-t pt-8">
              <div className="flex flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
                <div className="text-gray-400 text-sm">
                  <FormattedMessage
                    id="footer.copyright"
                    defaultMessage="© {now, date, ::yyyy} mrtdown. All rights reserved."
                    values={{
                      now: DateTime.now().toMillis(),
                    }}
                  />
                </div>
                <div className="flex items-center space-x-6 text-gray-400 text-sm">
                  <span className="text-center text-sm italic">
                    <FormattedMessage
                      id="footer.disclaimer"
                      defaultMessage="This is an independent platform not affiliated with any public transport operator."
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </IntlProvider>
    </QueryClientProvider>
  );
}
