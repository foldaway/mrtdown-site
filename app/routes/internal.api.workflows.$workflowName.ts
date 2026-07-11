import { createFileRoute } from '@tanstack/react-router';
import { serveMany } from '@upstash/workflow/tanstack';
import { publicHolidaysWorkflow } from '~/workflows/publicHolidays';
import { pullWorkflow } from '~/workflows/pull';

export const Route = createFileRoute('/internal/api/workflows/$workflowName')({
  server: {
    handlers: serveMany({
      pull: pullWorkflow,
      publicHolidays: publicHolidaysWorkflow,
    }),
  },
});
