import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  rebuildOperationalFactsRange,
  rebuildStatisticsSnapshot,
} from '~/util/db/queries';
import { internalMiddleware } from '~/util/internal.middleware';

const RequestSchema = z.object({
  days: z.number().int().min(1).max(366).default(30),
});

export const Route = createFileRoute('/internal/api/tasks/facts')({
  server: {
    middleware: [internalMiddleware],
    handlers: {
      async POST({ request }) {
        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return Response.json(
            { success: false, error: 'Invalid JSON request body' },
            { status: 400 },
          );
        }

        const parsed = RequestSchema.safeParse(json);
        if (!parsed.success) {
          return Response.json(
            {
              success: false,
              error: 'Invalid facts rebuild request',
              issues: parsed.error.issues,
            },
            { status: 400 },
          );
        }

        const { days } = parsed.data;
        const rows = await rebuildOperationalFactsRange(days);
        const statistics = await rebuildStatisticsSnapshot();
        return Response.json(
          {
            success: true,
            days,
            rows,
            statistics,
          },
          { status: 200 },
        );
      },
    },
  },
});
