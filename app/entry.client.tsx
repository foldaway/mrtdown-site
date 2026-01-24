import * as Sentry from '@sentry/react-router';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { PostHogProvider } from '@posthog/react';
import posthog from 'posthog-js';

const { VITE_PUBLIC_POSTHOG_KEY, VITE_PUBLIC_POSTHOG_HOST } = import.meta.env;

if (VITE_PUBLIC_POSTHOG_KEY != null && VITE_PUBLIC_POSTHOG_HOST != null) {
  let api_host = VITE_PUBLIC_POSTHOG_HOST;
  let ui_host: string | undefined;
  let debug = true;
  if (import.meta.env.PROD) {
    api_host = '/api/ph';
    ui_host = VITE_PUBLIC_POSTHOG_HOST;
    debug = false;
  }

  posthog.init(VITE_PUBLIC_POSTHOG_KEY, {
    api_host,
    ui_host,
    defaults: '2026-01-30',
    __add_tracing_headers: [window.location.host, 'localhost'],
    debug,
  });
}

Sentry.init({
  dsn: __SENTRY_DSN__,
  environment: __SENTRY_ENVIRONMENT__,
  release: __SENTRY_RELEASE__,
});

startTransition(() => {
  hydrateRoot(
    document,
    <PostHogProvider client={posthog}>
      <StrictMode>
        <HydratedRouter />
      </StrictMode>
    </PostHogProvider>,
  );
});
