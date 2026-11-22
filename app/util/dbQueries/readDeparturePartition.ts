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
  const template = sql`(to_jsonb(${occurrences}) - ARRAY[
    'projection_id', 'station_id', 'service_date', 'arrival_instant', 'departure_instant',
    'service_id', 'revision_id', 'platform_ids']::text[])
    || jsonb_build_object('boardingByService', ${boarding})
    ${isCombined ? sql`` : sql`|| jsonb_build_object('platform_semantics', 'distinct-platform-associations')`}`;
  // SQL validates the same noon-minus-12h GTFS time base used by @mrtdown/core;
  // compaction may remove dates/instants only when reconstruction is lossless.
  const start = sql`((${occurrences.service_date} + time '12:00') AT TIME ZONE 'Asia/Singapore') - interval '12 hours'`;
  const consistent = sql<boolean>`
    (${occurrences.arrival_instant} IS NOT DISTINCT FROM (${start}) + ${occurrences.arrival_seconds} * interval '1 second')
    AND (${occurrences.departure_instant} IS NOT DISTINCT FROM (${start}) + ${occurrences.departure_seconds} * interval '1 second')`;
  const source = tx
    .select({
      template: template.as('template'),
      serviceDate: occurrences.service_date,
      consistent: consistent.as('consistent'),
    })
    .from(occurrences)
    .where(
      and(
        eq(occurrences.projection_id, identity.projectionId),
        eq(occurrences.station_id, identity.stationId),
      ),
    )
    .as('source');
  const groups = tx
    .select({
      template: source.template,
      dates: sql<
        string[]
      >`array_agg(${source.serviceDate}::text ORDER BY ${source.serviceDate})`.as(
        'dates',
      ),
      consistent: sql<boolean>`bool_and(${source.consistent})`.as('consistent'),
    })
    .from(source)
    .groupBy(source.template)
    .orderBy(sql`${source.template}::text COLLATE "C"`)
    .limit(MAX_DEPARTURE_TEMPLATES + 1)
    .as('groups');
  // Check the aggregate byte budget in SQL before transferring templates/dates.
  const withinBudget = sql`sum(octet_length(${groups.template}::text) +
    octet_length(array_to_json(${groups.dates})::text) + 64) OVER ()
    <= ${DEPARTURE_PARTITION_LIMITS.jsonBytes}`;
  const grouped = await tx
    .select({
      template: sql<
        Record<string, unknown>
      >`CASE WHEN ${withinBudget} THEN ${groups.template} END`,
      dates: sql<string[]>`CASE WHEN ${withinBudget} THEN ${groups.dates} END`,
      consistent: groups.consistent,
      withinBudget: sql<boolean>`${withinBudget}`,
    })
    .from(groups)
    .orderBy(sql`${groups.template}::text COLLATE "C"`);
  if (grouped.some((row) => !row.withinBudget))
    throw new Error('Snapshot exceeds JSON limit');
  if (grouped.some((row) => !row.consistent))
    throw new Error('Departure instants do not match source offsets');
  return parseDeparturePartition({
    ...identity,
    calls: grouped.map((row) => ({
      ...(row.template as Record<string, unknown>),
      serviceDates: row.dates,
    })),
  });
}
