import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { RouteWebVitals } from '~/components/RouteWebVitals';
import { SentryAnonymousUserBootstrap } from '~/components/SentryAnonymousUserBootstrap';
import { LANGUAGES } from '~/constants';
import { getPosthogOptions } from '~/helpers/getPosthogOptions';
import { OptionalPostHogProvider } from '~/helpers/OptionalPostHogProvider';
import stylesheet from '../index.css?url';

export const Route = createRootRoute({
  head() {
    return {
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
        { charSet: 'utf-8' },
      ],
      links: [
        { rel: 'stylesheet', href: stylesheet },
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: '/apple-touch-icon.png',
        },
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
      ],
    };
  },
  component: RootComponent,
  // errorComponent: ErrorBoundary,
});

const posthogOptions = getPosthogOptions();

function RootComponent() {
  return (
    <RootDocument>
      <OptionalPostHogProvider
        apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
        options={posthogOptions}
      >
        <SentryAnonymousUserBootstrap />
        <RouteWebVitals />
        <Outlet />
      </OptionalPostHogProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const pathLocale = pathname.split('/')[1];
  const lang = LANGUAGES.includes(pathLocale) ? pathLocale : 'en-SG';

  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
