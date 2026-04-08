import '../instrument.server.mjs';
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
import handler from '@tanstack/react-start/server-entry';

const wrappedFetch = wrapFetchWithSentry({
  fetch(request) {
    return handler.fetch(request);
  },
});

export default {
  fetch: wrappedFetch.fetch,
} satisfies ExportedHandler<Env>;
