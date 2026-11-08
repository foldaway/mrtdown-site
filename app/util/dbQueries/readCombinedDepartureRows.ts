import {
  and,
  arrayContains,
  count,
  eq,
  exists,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lt,
  sql,
} from 'drizzle-orm';
import {
  combinedDepartureMembershipsTable as memberships,
  combinedDepartureOccurrencesTable as occurrences,
} from '~/db/scheduledDepartures.schema';
import {
  type IndexedTimetableScope,
  indexedServiceIds,
  type ReadTransaction,
} from './withSelectedScheduledTimetable';

export type BoardingMembership = {
  serviceId: string;
  revisionId: string;
  platformIds: string[];
};

export async function readCombinedDepartureRows(
  tx: ReadTransaction,
  scope: IndexedTimetableScope,
  projectionId: number,
  serviceDate: string,
  lowerBound: string,
  upperBound: string,
) {
  const membershipFilter = and(
    eq(memberships.projection_id, occurrences.projection_id),
    eq(memberships.service_date, occurrences.service_date),
    eq(memberships.provider_trip_id, occurrences.provider_trip_id),
    eq(memberships.stop_sequence, occurrences.stop_sequence),
    inArray(memberships.service_id, indexedServiceIds(scope)),
    scope.platformId === undefined
      ? undefined
      : arrayContains(memberships.platform_ids, [scope.platformId]),
  );
  const scopeFilter = and(
    eq(occurrences.projection_id, projectionId),
    eq(occurrences.service_date, serviceDate),
    eq(occurrences.station_id, scope.stationId),
    eq(occurrences.line_id, scope.lineId),
    eq(occurrences.destination_station_id, scope.destinationStationId),
    exists(
      tx.select({ one: sql`1` }).from(memberships).where(membershipFilter),
    ),
  );
  // Use a membership semijoin for both counts and timed rows. A shared call
  // contributes one occurrence even when several services satisfy the filter.
  const [untimed] = await tx
    .select({ count: count() })
    .from(occurrences)
    .where(and(scopeFilter, isNull(occurrences.departure_instant)));
  const boarding = tx
    .select({
      value: sql`jsonb_agg(jsonb_build_object(
      'serviceId', ${memberships.service_id},
      'revisionId', ${memberships.revision_id},
      'platformIds', ${memberships.platform_ids}
    ) ORDER BY ${memberships.service_id} COLLATE "C", ${memberships.revision_id} COLLATE "C")`,
    })
    .from(memberships)
    .where(membershipFilter);
  const rows = await tx
    .select({
      ...getTableColumns(occurrences),
      boardingByService: sql<BoardingMembership[]>`(${boarding})`,
    })
    .from(occurrences)
    .where(
      and(
        scopeFilter,
        gte(occurrences.departure_instant, lowerBound),
        lt(occurrences.departure_instant, upperBound),
      ),
    );
  return { untimed, rows };
}
