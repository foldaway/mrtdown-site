import { Temporal } from '@js-temporal/polyfill';
import { createFileRoute } from '@tanstack/react-router';
import z from 'zod';
import { getDb } from '~/db';
import { readStationArrivalSource } from '~/util/dbQueries/readStationArrivalSource';
import { InvalidStationArrivalScopeError } from '~/util/dbQueries/withSelectedScheduledTimetable';
import {
  serializeStationArrivalsV2,
  STATION_ARRIVALS_V2_HORIZON_MINUTES,
  STATION_ARRIVALS_V2_LIMIT,
} from '~/util/stationArrivalsV2';

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const querySchema = z.strictObject({
  lineId: id,
  serviceId: id,
  destinationStationId: id,
  platformId: id.optional(),
});
const headers = { 'cache-control': 'no-store' };

export const Route = createFileRoute('/api/stations/$stationId/arrivals/v2')({
  server: {
    handlers: {
      async GET({ params, request }) {
        if (request.url.length > 2048) {
          return Response.json(
            { success: false, error: 'Invalid arrival scope or query' },
            { status: 400, headers },
          );
        }
        const query = new URL(request.url).searchParams;
        const parsed = querySchema.safeParse(Object.fromEntries(query));
        if (
          !id.safeParse(params.stationId).success ||
          !parsed.success ||
          [...query.keys()].length !== new Set(query.keys()).size
        ) {
          return Response.json(
            { success: false, error: 'Invalid arrival scope or query' },
            { status: 400, headers },
          );
        }
        try {
          const reference = Temporal.Now.instant();
          const decision = await readStationArrivalSource(getDb(), {
            scope: { stationId: params.stationId, ...parsed.data },
            referenceInstant: reference.toString(),
            endInstant: reference
              .add({ minutes: STATION_ARRIVALS_V2_HORIZON_MINUTES })
              .toString(),
            limit: STATION_ARRIVALS_V2_LIMIT,
          });
          return Response.json(
            { success: true, data: serializeStationArrivalsV2(decision) },
            { headers },
          );
        } catch (error) {
          if (error instanceof InvalidStationArrivalScopeError) {
            return Response.json(
              { success: false, error: 'Invalid arrival scope or query' },
              { status: 400, headers },
            );
          }
          console.error('Station arrival source read failed', { error });
          return Response.json(
            { success: false, error: 'Arrival refresh failed' },
            { status: 500, headers },
          );
        }
      },
    },
  },
});
