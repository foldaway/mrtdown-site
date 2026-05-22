import * as Sentry from '@sentry/cloudflare';
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
import handler from '@tanstack/react-start/server-entry';
import { handleScheduledWorkflows } from './workflows/scheduled';

const wrappedFetch = wrapFetchWithSentry({
  fetch(request) {
    return handler.fetch(request);
  },
});

export { PullWorkflow } from './workflows/pull';
export { PublicHolidaysWorkflow } from './workflows/publicHolidays';

export default Sentry.withSentry(
  (env) => {
    return {
      dsn: env.SENTRY_DSN ?? '',
      environment: env.TIER ?? 'development',
    };
  },
  {
    fetch: wrappedFetch.fetch,
    async scheduled(event, env, ctx) {
      await handleScheduledWorkflows(event, env, ctx);
    },
  } satisfies ExportedHandler<Env>,
);
