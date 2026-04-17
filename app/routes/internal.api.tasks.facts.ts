import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { rebuildOperationalFactsRange } from '~/util/db.queries';
import { internalMiddleware } from '~/util/internal.middleware';

const RequestSchema = z.object({
  days: z.number().int().min(1).max(366).default(30),
});

export const Route = createFileRoute('/internal/api/tasks/facts')({
  server: {
    middleware: [internalMiddleware],
    handlers: {
      async POST({ request }) {
        const json = await request.json().catch(() => ({}));
        const { days } = RequestSchema.parse(json);
        const rows = await rebuildOperationalFactsRange(days);
        return Response.json(
          {
            success: true,
            days,
            rows,
          },
          { status: 200 },
        );
      },
    },
  },
});
