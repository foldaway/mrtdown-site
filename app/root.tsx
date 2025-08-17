import { LinkIcon } from '@heroicons/react/16/solid';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { ClockIcon } from '@heroicons/react/24/solid';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import { DropdownMenu } from 'radix-ui';
import { useMemo } from 'react';
import { FormattedDate, FormattedMessage, IntlProvider } from 'react-intl';
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  NavLink,
  type NavLinkProps,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
  useParams,
} from 'react-router';
import type { Route } from './+types/root';
import { getLines, getMetadata } from './client';
import { HrefLangs } from './components/HrefLangs';
import { LocaleSwitcher } from './components/LocaleSwitcher';
import Spinner from './components/Spinner';
import { buildLocaleAwareLink } from './helpers/buildLocaleAwareLink';
import stylesheet from './index.css?url';
import { assert } from './util/assert';

export const links: Route.LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Radio+Canada+Big:ital,wght@0,400..700;1,400..700&display=swap',
  },
  { rel: 'stylesheet', href: stylesheet },
  { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
  {
    rel: 'icon',
    type: 'image/png',
    sizes: '32x32',
    href: '/favicon-32x32.png',
  },
  {
    rel: 'icon',
    type: 'image/png',
    sizes: '16x16',
    href: '/favicon-16x16.png',
  },
  { rel: 'manifest', href: '/site.webmanifest' },
];

const queryClient = new QueryClient();

export function Layout({ children }: { children: React.ReactNode }) {
  const { lang = 'en-SG' } = useParams();

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <HrefLangs />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <Analytics />
      </body>
    </html>
  );
}

const navLinkClassNameFunction: NavLinkProps['className'] = ({ isActive }) => {
  return classNames(
    'relative text-center rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ease-in-out',
    {
      'bg-accent-light text-white shadow-md shadow-accent-light/25 hover:bg-accent-dark hover:shadow-lg hover:shadow-accent-light/30 transform hover:-translate-y-0.5':
        isActive,
      'text-gray-700 dark:text-gray-300 hover:text-white dark:hover:text-white hover:bg-accent-light dark:hover:bg-accent-light':
        !isActive,
    },
  );
};

const navLinkClassNameFunctionMobile: NavLinkProps['className'] = ({
  isActive,
}) => {
  return classNames(
    'group flex w-full items-center rounded-xl px-4 py-3 font-medium text-sm outline-none transition-all duration-200 ease-out',
    {
      'bg-gradient-to-r from-accent-light to-accent-dark text-white shadow-accent-light/30 shadow-lg':
        isActive,
      'text-gray-700 hover:bg-gradient-to-r hover:from-accent-light/10 hover:to-accent-light/5 hover:text-accent-light focus:bg-gradient-to-r focus:from-accent-light/10 focus:to-accent-light/5 focus:text-accent-light data-[highlighted]:bg-gradient-to-r data-[highlighted]:from-accent-light/10 data-[highlighted]:to-accent-light/5 data-[highlighted]:text-accent-light dark:text-gray-300 dark:data-[highlighted]:bg-gradient-to-r dark:data-[highlighted]:from-accent-light/20 dark:data-[highlighted]:to-accent-light/10 dark:data-[highlighted]:text-accent-light dark:focus:bg-gradient-to-r dark:focus:from-accent-light/20 dark:focus:to-accent-light/10 dark:focus:text-accent-light dark:hover:bg-gradient-to-r dark:hover:from-accent-light/20 dark:hover:to-accent-light/10 dark:hover:text-accent-light':
        !isActive,
    },
  );
};

export async function loader({ params }: Route.LoaderArgs) {
  const { lang = 'en-SG' } = params;

  const { default: messages } = await import(`../lang/${lang}.json`);

  const { data, error, response } = await getLines({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
  });
  if (error != null) {
    console.error('Error fetching lines:', error);
    throw new Response('Failed to fetch lines', {
      status: response.status,
      statusText: response.statusText,
    });
  }
  assert(data != null);

  const metadataResponse = await getMetadata({
    auth: () => process.env.API_TOKEN,
    baseUrl: process.env.API_ENDPOINT,
  });
  if (metadataResponse.error != null) {
    console.error('Error fetching metadata:', metadataResponse.error);
    throw new Response('Failed to fetch metadata', {
      status: metadataResponse.response.status,
      statusText: metadataResponse.response.statusText,
    });
  }
  assert(metadataResponse.data != null);

  const metadata = metadataResponse.data.data;

  const { lineIds } = data.data;
  const { included } = data;

  return {
    messages,
    lineIds,
    included,
    metadata,
  };
}

export default function App(props: Route.ComponentProps) {
  const { params, loaderData } = props;
  const { lang } = params;
  const { messages, lineIds, included, metadata } = loaderData;

  const navigation = useNavigation();
  const isNavigating = Boolean(navigation.location);

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
                  to={buildLocaleAwareLink('/', lang)}
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
                  <NavLink
                    to={buildLocaleAwareLink('/', lang)}
                    className={navLinkClassNameFunction}
                    end
                  >
                    <FormattedMessage id="general.home" defaultMessage="Home" />
                  </NavLink>
                  <NavLink
                    to={buildLocaleAwareLink('/history', lang)}
                    className={navLinkClassNameFunction}
                  >
                    <FormattedMessage
                      id="general.history"
                      defaultMessage="History"
                    />
                  </NavLink>
                  <NavLink
                    to={buildLocaleAwareLink('/statistics', lang)}
                    className={navLinkClassNameFunction}
                  >
                    <FormattedMessage
                      id="general.statistics"
                      defaultMessage="Statistics"
                    />
                  </NavLink>
                  <NavLink
                    to={buildLocaleAwareLink('/system-map', lang)}
                    className={navLinkClassNameFunction}
                  >
                    <FormattedMessage
                      id="general.system_map"
                      defaultMessage="System Map"
                    />
                  </NavLink>
                  <NavLink
                    to={buildLocaleAwareLink('/about', lang)}
                    className={navLinkClassNameFunction}
                  >
                    <FormattedMessage
                      id="general.about"
                      defaultMessage="About"
                    />
                  </NavLink>
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
                          <NavLink
                            to={buildLocaleAwareLink('/', lang)}
                            className={navLinkClassNameFunctionMobile}
                            end
                          >
                            <FormattedMessage
                              id="general.home"
                              defaultMessage="Home"
                            />
                          </NavLink>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item>
                          <NavLink
                            to={buildLocaleAwareLink('/history', lang)}
                            className={navLinkClassNameFunctionMobile}
                          >
                            <FormattedMessage
                              id="general.history"
                              defaultMessage="History"
                            />
                          </NavLink>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item>
                          <NavLink
                            to={buildLocaleAwareLink('/statistics', lang)}
                            className={navLinkClassNameFunctionMobile}
                          >
                            <FormattedMessage
                              id="general.statistics"
                              defaultMessage="Statistics"
                            />
                          </NavLink>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item>
                          <NavLink
                            to={buildLocaleAwareLink('/system-map', lang)}
                            className={navLinkClassNameFunctionMobile}
                          >
                            <FormattedMessage
                              id="general.system_map"
                              defaultMessage="System Map"
                            />
                          </NavLink>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item>
                          <NavLink
                            to={buildLocaleAwareLink('/about', lang)}
                            className={navLinkClassNameFunctionMobile}
                          >
                            <FormattedMessage
                              id="general.about"
                              defaultMessage="About"
                            />
                          </NavLink>
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

          {isNavigating && (
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
                          to={buildLocaleAwareLink(`/lines/${lineId}`, lang)}
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
                      to={buildLocaleAwareLink('/history', lang)}
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
                      to={buildLocaleAwareLink('/system-map', lang)}
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
                        to={buildLocaleAwareLink(
                          `/stations/${station.id}`,
                          lang,
                        )}
                        className="flex text-sm transition-colors hover:text-blue-400"
                      >
                        {station.name_translations[lang ?? 'en-SG'] ??
                          station.name}
                      </Link>
                    </li>
                  ))}*/}
                </ul>
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
                      to={buildLocaleAwareLink('/about', lang)}
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
                            lastUpdatedAt: (
                              <FormattedDate
                                value={lastUpdatedAt}
                                dateStyle="medium"
                                timeStyle="short"
                              />
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404
        ? 'The requested page could not be found.'
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
  }

  return (
    <main className="container mx-auto p-4 pt-16 text-gray-900 dark:text-gray-50">
      <h1 className="font-bold">{message}</h1>
      <p>{details}</p>
    </main>
  );
}
