import { createFileRoute } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { getHistoryDayData } from '../util/db.queries';

function parseDatePart(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

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

        const yearNumber = parseDatePart(year);
        const monthNumber = parseDatePart(month);
        const dayNumber = parseDatePart(day);
        if (yearNumber == null || monthNumber == null || dayNumber == null) {
          return new Response('Invalid parameters: year, month, day', {
            status: 400,
            statusText: 'Bad Request',
          });
        }

        const date = DateTime.fromObject({
          year: yearNumber,
          month: monthNumber,
          day: dayNumber,
        });
        if (!date.isValid) {
          return new Response('Invalid date parameters: year, month, day', {
            status: 400,
            statusText: 'Bad Request',
          });
        }

        const data = await getHistoryDayData(
          yearNumber,
          monthNumber,
          dayNumber,
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
