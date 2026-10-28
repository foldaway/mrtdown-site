import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/arrival-reports')({
  server: {
    handlers: {
      POST() {
        return Response.json(
          {
            success: false,
            error: 'Arrival estimate calibration has been retired.',
          },
          { status: 410, headers: { 'cache-control': 'no-store' } },
        );
      },
    },
  },
});
