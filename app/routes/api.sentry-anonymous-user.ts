import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/sentry-anonymous-user')({
  server: {
    handlers: {
      async GET() {
        // app/server.ts appends the anonymous Sentry cookie to this response.
        // The route has no body and must never be cached or coalesced by a CDN.
        return new Response(null, {
          status: 204,
          headers: { 'cache-control': 'no-store' },
        });
      },
    },
  },
});
