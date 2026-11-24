import { and, eq, sql } from 'drizzle-orm';
import {
  combinedDepartureMembershipsTable as memberships,
  combinedDepartureOccurrencesTable as combined,
  scheduledDepartureOccurrencesTable as legacy,
} from '~/db/scheduledDepartures.schema';
import type { AppDbTransaction } from './database';
import {
  DEPARTURE_PARTITION_LIMITS,
  MAX_DEPARTURE_TEMPLATES,
  parseDeparturePartition,
} from './departurePartition';
import {
  COMBINED_DEPARTURE_PROJECTOR_VERSION,
  SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
} from './projectScheduledTimetable';

export type DeparturePartitionIdentity = {
  projectionId: number;
  stationId: string;
};

export async function readDeparturePartition(
  tx: AppDbTransaction,
  identity: DeparturePartitionIdentity,
  projectorVersion: number,
) {
  if (
    ![
      SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
      COMBINED_DEPARTURE_PROJECTOR_VERSION,
    ].includes(projectorVersion)
  )
    throw new Error('Unsupported departure projector');
  const isCombined = projectorVersion === COMBINED_DEPARTURE_PROJECTOR_VERSION;
  const occurrences = isCombined ? combined : legacy;
  const boarding = isCombined
    ? sql`(SELECT jsonb_agg(jsonb_build_object(
    'serviceId', ${memberships.service_id}, 'revisionId', ${memberships.revision_id},
    'platformIds', ${memberships.platform_ids})
    ORDER BY ${memberships.service_id} COLLATE "C", ${memberships.revision_id} COLLATE "C")
    FROM ${memberships} WHERE ${memberships.projection_id} = ${occurrences.projection_id}
      AND ${memberships.service_date} = ${occurrences.service_date}
      AND ${memberships.provider_trip_id} = ${occurrences.provider_trip_id}
      AND ${memberships.stop_sequence} = ${occurrences.stop_sequence})`
    : sql`jsonb_build_array(jsonb_build_object('serviceId', ${legacy.service_id},
      'revisionId', ${legacy.revision_id}, 'platformIds', ${legacy.platform_ids}))`;
  const columns = {
    provider_trip_id: occurrences.provider_trip_id,
    provider_route_id: occurrences.provider_route_id,
    provider_calendar_id: occurrences.provider_calendar_id,
    provider_stop_id: occurrences.provider_stop_id,
    stop_sequence: occurrences.stop_sequence,
    occurrence_index: occurrences.occurrence_index,
    line_id: occurrences.line_id,
    destination_station_id: occurrences.destination_station_id,
    arrival_seconds: occurrences.arrival_seconds,
    departure_seconds: occurrences.departure_seconds,
    pickup_type: occurrences.pickup_type,
    drop_off_type: occurrences.drop_off_type,
    timepoint: occurrences.timepoint,
  };
  const platformSemantics = isCombined
    ? sql`${combined.platform_semantics}`
    : sql`'distinct-platform-associations'`;
  // SQL validates the same noon-minus-12h GTFS time base used by @mrtdown/core;
  // compaction may remove dates/instants only when reconstruction is lossless.
  const start = sql`((${occurrences.service_date} + time '12:00') AT TIME ZONE 'Asia/Singapore') - interval '12 hours'`;
  const consistent = sql<boolean>`
    (${occurrences.arrival_instant} IS NOT DISTINCT FROM (${start}) + ${occurrences.arrival_seconds} * interval '1 second')
    AND (${occurrences.departure_instant} IS NOT DISTINCT FROM (${start}) + ${occurrences.departure_seconds} * interval '1 second')`;
  // Group native columns first. Encoding and sorting the entire call as JSON
  // for every service date is costly even when most dates share that call.
  const groups = tx
    .select({
      ...columns,
      platform_semantics: platformSemantics.as('platform_semantics'),
      // Nest this SQL so Drizzle preserves its correlated table qualifiers.
      boardingByService: sql`${boarding}`.as('boardingByService'),
      dates: sql<
        string[]
      >`array_agg(${occurrences.service_date}::text ORDER BY ${occurrences.service_date})`.as(
        'dates',
      ),
      consistent: sql<boolean>`bool_and(${consistent})`.as('consistent'),
    })
    .from(occurrences)
    .where(
      and(
        eq(occurrences.projection_id, identity.projectionId),
        eq(occurrences.station_id, identity.stationId),
      ),
    )
    .groupBy(
      ...Object.values(columns),
      ...(isCombined ? [combined.platform_semantics] : []),
      boarding,
    )
    .limit(MAX_DEPARTURE_TEMPLATES + 1)
    .as('groups');
  const template = sql`(to_jsonb(${sql.identifier('groups')}) - ARRAY['dates', 'consistent']::text[])`;
  // Keep oversized SQL aggregates out of the Node process.
  const withinBudget = sql`sum(octet_length(${template}::text) +
    octet_length(array_to_json(${groups.dates})::text) + 64) OVER ()
    <= ${DEPARTURE_PARTITION_LIMITS.jsonBytes}`;
  const grouped = await tx
    .select({
      template: sql<
        Record<string, unknown>
      >`CASE WHEN ${withinBudget} THEN ${template} END`,
      dates: sql<string[]>`CASE WHEN ${withinBudget} THEN ${groups.dates} END`,
      consistent: groups.consistent,
      withinBudget: sql<boolean>`${withinBudget}`,
    })
    .from(groups)
    .orderBy(sql`${template}::text COLLATE "C"`);
  if (grouped.some((row) => !row.withinBudget))
    throw new Error('Snapshot exceeds JSON limit');
  if (grouped.some((row) => !row.consistent))
    throw new Error('Departure instants do not match source offsets');
  return parseDeparturePartition({
    ...identity,
    calls: grouped.map((row) => ({
      ...row.template,
      serviceDates: row.dates,
    })),
  });
}
