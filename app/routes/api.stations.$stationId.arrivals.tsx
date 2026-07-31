import { createFileRoute } from '@tanstack/react-router';
import { getStationArrivalLinesReadModel } from '~/util/dbQueries/stationArrivals';

export const Route = createFileRoute('/api/stations/$stationId/arrivals')({
  server: {
    handlers: {
      async GET({ params }) {
        try {
          const arrivalLines = await getStationArrivalLinesReadModel(
            params.stationId,
          );
          return Response.json(
            { success: true, data: arrivalLines },
            { headers: { 'cache-control': 'no-store' } },
          );
        } catch (error) {
          console.error('Station arrival refresh failed', { error });
          return Response.json(
            { success: false, error: 'Arrival refresh failed' },
            { status: 500, headers: { 'cache-control': 'no-store' } },
          );
        }
      },
    },
  },
});
