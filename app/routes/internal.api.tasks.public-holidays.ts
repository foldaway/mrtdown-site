import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
import { internalMiddleware } from '~/util/internal.middleware';

export const Route = createFileRoute('/internal/api/tasks/public-holidays')({
  server: {
    middleware: [internalMiddleware],
    handlers: {
      async POST() {
        if (!env.PUBLIC_HOLIDAYS_WORKFLOW) {
          return Response.json(
            {
              success: false,
              error: 'PUBLIC_HOLIDAYS_WORKFLOW binding is missing',
            },
            { status: 503 },
          );
        }

        try {
          const workflow = await env.PUBLIC_HOLIDAYS_WORKFLOW.create();
          if (!workflow?.id) {
            return Response.json(
              {
                success: false,
                error: 'PUBLIC_HOLIDAYS_WORKFLOW creation failed',
              },
              { status: 500 },
            );
          }

          return Response.json(
            { success: true, workflowId: workflow.id },
            {
              status: 202,
            },
          );
        } catch (error) {
          console.error('PUBLIC_HOLIDAYS_WORKFLOW creation failed', { error });
          return Response.json(
            {
              success: false,
              error: 'PUBLIC_HOLIDAYS_WORKFLOW creation failed',
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
