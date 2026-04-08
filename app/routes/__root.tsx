import { PostHogProvider, usePostHog } from '@posthog/react';
import * as Sentry from '@sentry/tanstackstart-react';
import {
  createRootRoute,
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { getPosthogOptions } from '~/helpers/getPosthogOptions';
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
  errorComponent: ErrorBoundary,
});

const posthogOptions = getPosthogOptions();

function RootComponent() {
  return (
    <RootDocument>
      <PostHogProvider
        apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
        options={posthogOptions}
      >
        <Outlet />
      </PostHogProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { lang = 'en-SG' } = Route.useParams();

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

function ErrorBoundary({ error }: ErrorComponentProps) {
  const message = 'Oops!';
  let details = 'An unexpected error occurred.';

  const posthog = usePostHog();

  useEffect(() => {
    posthog.captureException(error);
  }, [posthog, error]);

  if (error && error instanceof Error) {
    // you only want to capture non 404-errors that reach the boundary
    Sentry.captureException(error);
    if (import.meta.env.DEV) {
      details = error.message;
    }
  }

  return (
    <main className="container mx-auto px-4 py-16 text-gray-900 dark:text-gray-50">
      <h1 className="font-bold text-2xl">{message}</h1>
      <p className="mt-2 text-base">{details}</p>
    </main>
  );
}
