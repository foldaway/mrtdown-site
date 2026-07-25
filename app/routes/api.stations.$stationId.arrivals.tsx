import { createFileRoute } from '@tanstack/react-router';
import { getStationProfileReadModel } from '~/util/dbQueries/stations';

export const Route = createFileRoute('/api/stations/$stationId/arrivals')({
  server: {
    handlers: {
      async GET({ params }) {
        try {
          const profile = await getStationProfileReadModel(params.stationId, {
            includeCommunitySignals: false,
          });
          return Response.json(
            { success: true, data: profile.data.arrivalLines },
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
