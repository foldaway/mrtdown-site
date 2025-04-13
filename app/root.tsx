import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  ScrollRestoration,
  Scripts,
  Meta,
  Links,
  isRouteErrorResponse,
  type LinksFunction,
  NavLink,
  Link,
  type NavLinkProps,
  useNavigation,
} from 'react-router';

import stylesheet from './index.css?url';
import type { Route } from './+types/root';
import { DateTime } from 'luxon';
import classNames from 'classnames';
import Spinner from './components/Spinner';

export const links: LinksFunction = () => [
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

export default function App() {
  const navigation = useNavigation();
  const isNavigating = Boolean(navigation.location);

  return (
    <QueryClientProvider client={queryClient}>
      <header className="flex w-full flex-col items-center p-10">
        <Link to="/">
          <h1 className="px-2 font-bold text-gray-900 italic hover:underline dark:text-gray-200">
            mrtdown
          </h1>
        </Link>
        <p className="max-w-4xl text-center text-gray-500 text-sm dark:text-gray-400">
          community-run transit monitoring
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:flex-row">
          <NavLink to="/" className={navLinkClassNameFunction}>
            Home
          </NavLink>
          <NavLink to="/history" className={navLinkClassNameFunction}>
            History
          </NavLink>
          <NavLink to="/statistics" className={navLinkClassNameFunction}>
            Statistics
          </NavLink>
          <NavLink to="/system-map" className={navLinkClassNameFunction}>
            System Map
          </NavLink>
          <NavLink to="/about" className={navLinkClassNameFunction}>
            About
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
        <span className="text-gray-500 text-sm">
          &copy; {DateTime.now().toFormat('y')} mrtdown
        </span>
        <span className="text-gray-500 text-sm italic">
          This is an independent platform not affiliated with any public
          transport operator.
        </span>
      </footer>
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
