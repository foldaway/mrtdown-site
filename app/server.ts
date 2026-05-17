import * as Sentry from '@sentry/cloudflare';
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
import handler from '@tanstack/react-start/server-entry';

const wrappedFetch = wrapFetchWithSentry({
  fetch(request) {
    return handler.fetch(request);
  },
});

export { PullWorkflow } from './workflows/pull';

export default Sentry.withSentry(
  (env) => {
    return {
      dsn: env.SENTRY_DSN ?? '',
      environment: env.TIER ?? 'development',
      release: env.GIT_SHA ?? 'development',
    };
  },
  {
    fetch: wrappedFetch.fetch,
    async scheduled(_event, env, ctx) {
      const workflow = env.PULL_WORKFLOW?.create();
      if (workflow != null) {
        ctx.waitUntil(workflow);
      }
    },
  } satisfies ExportedHandler<Env>,
);
