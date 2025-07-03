import { LinkIcon } from '@heroicons/react/16/solid';
import { ClockIcon } from '@heroicons/react/24/solid';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import classNames from 'classnames';
import { DateTime } from 'luxon';
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
import { HrefLangs } from './components/HrefLangs';
import { LocaleSwitcher } from './components/LocaleSwitcher';
import Spinner from './components/Spinner';
import { buildLocaleAwareLink } from './helpers/buildLocaleAwareLink';
import stylesheet from './index.css?url';
import type { FooterManifest } from './types';
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
      </body>
    </html>
  );
}

const navLinkClassNameFunction: NavLinkProps['className'] = ({ isActive }) => {
  return classNames(
    'text-center rounded-md px-4 py-1 text-base font-medium hover:bg-gray-200 dark:hover:bg-gray-800',
    {
      'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-200': isActive,
      'text-gray-600 dark:text-gray-400': !isActive,
    },
  );
};

export async function loader({ params }: Route.LoaderArgs) {
  const { lang = 'en-SG' } = params;

  const { default: messages } = await import(`../lang/${lang}.json`);

  const res = await fetch(
    'https://data.mrtdown.foldaway.space/product/footer_manifest.json',
  );
  assert(res.ok, res.statusText);
  const footerManifest: FooterManifest = await res.json();

  return {
    messages,
    footerManifest,
  };
}

export default function App(props: Route.ComponentProps) {
  const { params, loaderData } = props;
  const { lang } = params;
  const { messages, footerManifest } = loaderData;

  const navigation = useNavigation();
  const isNavigating = Boolean(navigation.location);

  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale={lang ?? 'en-SG'} messages={messages}>
        <header className="flex w-full flex-col items-center p-10">
          <Link to="/">
            <h1 className="px-2 font-bold text-gray-900 italic hover:underline dark:text-gray-200">
              mrtdown
            </h1>
          </Link>
          <p className="max-w-4xl text-center text-gray-500 text-sm dark:text-gray-400">
            <FormattedMessage
              id="site.tagline"
              defaultMessage="community-run transit monitoring"
            />
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:flex-row">
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
              <FormattedMessage id="general.history" defaultMessage="History" />
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
              <FormattedMessage id="general.about" defaultMessage="About" />
            </NavLink>
          </div>
        </header>
        <main className="mx-4 flex max-w-5xl flex-col bg-gray-50 lg:mx-auto dark:bg-gray-900">
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
                    src="/favicon-32x32.png"
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
                  {footerManifest.components.map((component) => (
                    <li key={component.id}>
                      <Link
                        to={buildLocaleAwareLink(
                          `/status/${component.id}`,
                          lang,
                        )}
                        className="flex items-center gap-x-1.5 text-sm transition-colors hover:text-blue-400"
                      >
                        <span
                          className="rounded-sm px-2 py-1 font-semibold text-white text-xs leading-none"
                          style={{ backgroundColor: component.color }}
                        >
                          {component.id}
                        </span>
                        {component.title_translations[lang ?? 'en-SG'] ??
                          component.title}
                      </Link>
                    </li>
                  ))}
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
                  {footerManifest.featuredStations.map((station) => (
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
                  ))}
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
                      className="flex text-sm transition-colors hover:text-blue-400"
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
                      className="text-sm transition-colors hover:text-blue-400"
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
                              value={footerManifest.lastUpdatedAt}
                              dateStyle="medium"
                              timeStyle="short"
                            />
                          ),
                        }}
                      />
                    </span>
                  </div>
                </div>
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
        </footer>{' '}
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
