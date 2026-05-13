import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
import { internalMiddleware } from '~/util/internal.middleware';

export const Route = createFileRoute('/internal/api/tasks/pull')({
  server: {
    middleware: [internalMiddleware],
    handlers: {
      async POST() {
        if (!env.PULL_WORKFLOW) {
          return Response.json(
            { success: false, error: 'PULL_WORKFLOW binding is missing' },
            { status: 503 },
          );
        }

        const workflow = await env.PULL_WORKFLOW.create();
        if (!workflow?.id) {
          return Response.json(
            { success: false, error: 'PULL_WORKFLOW creation failed' },
            { status: 500 },
          );
        }

        return Response.json(
          { success: true, workflowId: workflow.id },
          {
            status: 202,
          },
        );
      },
    },
  },
});
