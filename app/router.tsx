import * as Sentry from '@sentry/tanstackstart-react';
import { createRouter } from '@tanstack/react-router';
import { ErrorBoundary } from './components/ErrorBoundary';
import NotFound from './components/NotFound';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultNotFoundComponent() {
      return (
        <div className="mx-4 my-12 flex justify-center lg:mx-auto">
          <NotFound />
        </div>
      );
    },
    defaultErrorComponent: ErrorBoundary,
  });

  if (!router.isServer) {
    Sentry.init({
      dsn: __SENTRY_DSN__,
      environment: __SENTRY_ENVIRONMENT__,
      release: __SENTRY_RELEASE__,
    });
  }

  return router;
}
