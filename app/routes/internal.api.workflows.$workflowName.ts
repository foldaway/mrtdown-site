import { createFileRoute } from '@tanstack/react-router';
import { serveMany } from '@upstash/workflow/tanstack';
import { publicHolidaysWorkflow } from '~/workflows/publicHolidays';
import { pullWorkflow } from '~/workflows/pull';
import { isWorkflowRequestVerificationConfigured } from '~/workflows/requestVerification';

const workflowHandlers = serveMany({
  pull: pullWorkflow,
  publicHolidays: publicHolidaysWorkflow,
});

export const Route = createFileRoute('/internal/api/workflows/$workflowName')({
  server: {
    handlers: {
      async POST(context) {
        if (!isWorkflowRequestVerificationConfigured(process.env)) {
          return Response.json(
            {
              error: 'QStash workflow signature verification is not configured',
            },
            { status: 503 },
          );
        }

        return workflowHandlers.POST(context);
      },
    },
  },
});
