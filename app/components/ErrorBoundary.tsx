import { usePostHog } from '@posthog/react';
import * as Sentry from '@sentry/tanstackstart-react';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { useEffect } from 'react';

export function ErrorBoundary({ error }: ErrorComponentProps) {
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
    <div className="container mx-auto px-4 py-16 text-gray-900 dark:text-gray-50">
      <h1 className="font-bold text-2xl">{message}</h1>
      <p className="mt-2 text-base">{details}</p>
    </div>
  );
}
