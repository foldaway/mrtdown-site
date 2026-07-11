import { createFileRoute } from '@tanstack/react-router';
import { internalMiddleware } from '~/util/internal.middleware';
import { getClient } from '~/workflows/client';

const { VITE_ROOT_URL } = process.env;

export const Route = createFileRoute('/internal/api/tasks/public-holidays')({
  server: {
    middleware: [internalMiddleware],
    handlers: {
      async POST() {
        const client = getClient();
        const { workflowRunId } = await client.trigger({
          url: new URL(
            '/internal/api/workflows/publicHolidays',
            VITE_ROOT_URL,
          ).toString(),
          headers: {
            'Content-Type': 'application/json',
          },
          flowControl: {
            key: 'internal-api',
            parallelism: 1,
          },
        });
        return Response.json({ workflowRunId }, { status: 202 });
      },
    },
  },
});
