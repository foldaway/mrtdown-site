import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormattedMessage, IntlProvider } from 'react-intl';
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
} from 'react-router';

import classNames from 'classnames';
import { DateTime, Settings } from 'luxon';
import { useLocation } from 'react-router';
import type { Route } from './+types/root';
import { LocaleSwitcher } from './components/LocaleSwitcher';
import Spinner from './components/Spinner';
import { buildLocaleAwareLink } from './helpers/buildLocaleAwareLink';
import stylesheet from './index.css?url';

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
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
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
  Settings.defaultZone = 'Asia/Singapore';

  const { lang = 'en-SG' } = params;
  const { default: messages } = await import(`../lang/${lang}.json`);

  return {
    messages,
  };
}

export default function App(props: Route.ComponentProps) {
  const { params, loaderData } = props;
  const { lang } = params;
  const { messages } = loaderData;

  const navigation = useNavigation();
  const location = useLocation();
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
        <footer className="flex flex-col items-center p-10">
          <div className="mb-4 flex">
            <LocaleSwitcher />
          </div>

          <span className="text-gray-500 text-sm">
            &copy; {DateTime.now().toFormat('y')} mrtdown
          </span>
          <span className="text-gray-500 text-sm italic">
            <FormattedMessage
              id="footer.disclaimer"
              defaultMessage="This is an independent platform not affiliated with any public transport operator."
            />
          </span>
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
