import { createFileRoute } from '@tanstack/react-router';
import { getHistoryDayData } from '../util/db.queries';

export const Route = createFileRoute('/api/issues-day')({
  server: {
    handlers: {
      async GET(ctx) {
        const url = new URL(ctx.request.url);
        const year = url.searchParams.get('year');
        const month = url.searchParams.get('month');
        const day = url.searchParams.get('day');

        if (!year || !month || !day) {
          return new Response('Missing required parameters: year, month, day', {
            status: 400,
            statusText: 'Bad Request',
          });
        }

        const data = await getHistoryDayData(
          Number(year),
          Number(month),
          Number(day),
        );

        return Response.json({
          success: true,
          data: data.data,
          included: data.included,
        });
      },
    },
  },
});
