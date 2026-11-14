import { Temporal } from '@js-temporal/polyfill';
import { createFileRoute } from '@tanstack/react-router';
import z from 'zod';
import { getDb } from '~/db';
import {
  arrivalBranchQueryFields,
  arrivalScopeId,
} from '~/util/crowdArrivalReportContract';
import { getRecentCrowdArrival } from '~/util/crowdArrivalReports';
import { readStationArrivalSource } from '~/util/dbQueries/readStationArrivalSource';
import { InvalidStationArrivalScopeError } from '~/util/dbQueries/withSelectedScheduledTimetable';
import {
  STATION_ARRIVALS_V2_HORIZON_MINUTES,
  STATION_ARRIVALS_V2_LIMIT,
  serializeStationArrivalsV2,
} from '~/util/stationArrivalsV2';

const querySchema = z.strictObject({
  ...arrivalBranchQueryFields,
  platformId: arrivalScopeId.optional(),
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
          !arrivalScopeId.safeParse(params.stationId).success ||
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
          const db = getDb();
          const scope = { stationId: params.stationId, ...parsed.data };
          const referenceInstant = reference.toString();
          const decision = await readStationArrivalSource(db, {
            scope,
            referenceInstant,
            endInstant: reference
              .add({ minutes: STATION_ARRIVALS_V2_HORIZON_MINUTES })
              .toString(),
            limit: STATION_ARRIVALS_V2_LIMIT,
          });
          const recentCrowdArrival =
            scope.platformId === undefined
              ? await getRecentCrowdArrival(db, scope, referenceInstant).catch(
                  (error) => {
                    console.error('Recent arrival report read failed', {
                      error,
                    });
                    return undefined;
                  },
                )
              : undefined;
          return Response.json(
            {
              success: true,
              data: serializeStationArrivalsV2(decision, recentCrowdArrival),
            },
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
