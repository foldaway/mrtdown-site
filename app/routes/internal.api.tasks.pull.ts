import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
import { internalMiddleware } from '~/util/internal.middleware';

export const Route = createFileRoute('/internal/api/tasks/pull')({
  server: {
    middleware: [internalMiddleware],
    handlers: {
      async POST() {
        const workflow = await env.PULL_WORKFLOW?.create();
        return Response.json(
          { success: true, workflowId: workflow?.id },
          {
            status: 200,
          },
        );
      },
    },
  },
});
