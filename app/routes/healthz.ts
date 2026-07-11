import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      async GET() {
        return new Response(null, { status: 204 });
      },
    },
  },
});
