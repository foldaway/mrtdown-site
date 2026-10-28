import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/stations/$stationId/arrivals')({
  server: {
    handlers: {
      GET() {
        return Response.json(
          {
            success: false,
            error:
              'Frequency arrival estimates have been retired. Use the scoped arrivals v2 endpoint for timetable data.',
          },
          { status: 410, headers: { 'cache-control': 'no-store' } },
        );
      },
    },
  },
});
