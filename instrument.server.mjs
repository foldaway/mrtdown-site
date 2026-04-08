import * as Sentry from '@sentry/tanstackstart-react';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.TIER,
  release: process.env.GIT_SHA,
});