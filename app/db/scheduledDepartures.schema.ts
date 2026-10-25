import type { ScheduledDepartureWithPattern } from '@mrtdown/core';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { scheduledTimetablesTable } from './scheduledTimetables.schema.js';

// Algorithm version is distinct from the canonical topology projection version.
// A rebuild can coexist with the previous version until it is complete.
export const scheduledDepartureProjectionsTable = pgTable(
  'scheduled_departure_projections',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    manifest_sha256: text('manifest_sha256')
      .notNull()
      .references(() => scheduledTimetablesTable.manifest_sha256),
    projector_version: integer('projector_version').notNull(),
    topology_sha256: text('topology_sha256').notNull(),
    topology_projection_version: integer(
      'topology_projection_version',
    ).notNull(),
    feed_start_date: date('feed_start_date').notNull(),
    feed_end_date: date('feed_end_date').notNull(),
    maximum_departure_seconds: bigint('maximum_departure_seconds', {
      mode: 'number',
    }).notNull(),
    completed_at: timestamp('completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  (table) => [
    unique('scheduled_departure_projections_manifest_version').on(
      table.manifest_sha256,
      table.projector_version,
    ),
    check(
      'scheduled_departure_projections_identity',
      sql`${table.projector_version} > 0 AND ${table.topology_projection_version} > 0 AND ${table.topology_sha256} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'scheduled_departure_projections_range',
      sql`${table.feed_start_date} <= ${table.feed_end_date} AND ${table.maximum_departure_seconds} BETWEEN 0 AND 9007199254740991`,
    ),
  ],
);

// These are whole-source date counts, not counts of rows in a requested scope.
export const scheduledDepartureDaysTable = pgTable(
  'scheduled_departure_days',
  {
    projection_id: integer('projection_id')
      .notNull()
      .references(() => scheduledDepartureProjectionsTable.id, {
        onDelete: 'cascade',
      }),
    service_date: date('service_date').notNull(),
    active_trip_count: integer('active_trip_count').notNull(),
    unassigned_active_trip_count: integer(
      'unassigned_active_trip_count',
    ).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projection_id, table.service_date] }),
    check(
      'scheduled_departure_days_counts',
      sql`${table.active_trip_count} >= 0 AND ${table.unassigned_active_trip_count} BETWEEN 0 AND ${table.active_trip_count}`,
    ),
  ],
);

// Coverage comes from the selector's used patterns and active revisions; it
// exists independently of whether an active trip produces any departure rows.
export const scheduledDepartureScopesTable = pgTable(
  'scheduled_departure_scopes',
  {
    projection_id: integer('projection_id').notNull(),
    service_date: date('service_date').notNull(),
    station_id: text('station_id').notNull(),
    line_id: text('line_id').notNull(),
    service_id: text('service_id').notNull(),
    destination_station_id: text('destination_station_id').notNull(),
    platform_ids: text('platform_ids').array().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.projection_id,
        table.service_date,
        table.station_id,
        table.line_id,
        table.service_id,
        table.destination_station_id,
      ],
    }),
    foreignKey({
      name: 'scheduled_departure_scopes_day_fk',
      columns: [table.projection_id, table.service_date],
      foreignColumns: [
        scheduledDepartureDaysTable.projection_id,
        scheduledDepartureDaysTable.service_date,
      ],
    }).onDelete('cascade'),
    check(
      'scheduled_departure_scopes_platforms',
      sql`cardinality(${table.platform_ids}) > 0`,
    ),
  ],
);

type Departure = ScheduledDepartureWithPattern;

// Only boardable occurrences with a downstream alighting stop belong here.
// Null timing preserves untimed candidates without manufacturing departures.
export const scheduledDepartureOccurrencesTable = pgTable(
  'scheduled_departure_occurrences',
  {
    projection_id: integer('projection_id').notNull(),
    service_date: date('service_date').notNull(),
    provider_trip_id: text('provider_trip_id').notNull(),
    provider_route_id: text('provider_route_id').notNull(),
    provider_calendar_id: text('provider_calendar_id').notNull(),
    provider_stop_id: text('provider_stop_id').notNull(),
    stop_sequence: text('stop_sequence').notNull(),
    occurrence_index: integer('occurrence_index').notNull(),
    station_id: text('station_id').notNull(),
    line_id: text('line_id').notNull(),
    service_id: text('service_id').notNull(),
    revision_id: text('revision_id').notNull(),
    destination_station_id: text('destination_station_id').notNull(),
    platform_ids: text('platform_ids').array().notNull(),
    arrival_seconds: bigint('arrival_seconds', { mode: 'number' }),
    departure_seconds: bigint('departure_seconds', { mode: 'number' }),
    arrival_instant: timestamp('arrival_instant', {
      withTimezone: true,
      mode: 'string',
    }),
    departure_instant: timestamp('departure_instant', {
      withTimezone: true,
      mode: 'string',
    }),
    pickup_type: integer('pickup_type')
      .$type<Departure['pickupType']>()
      .notNull(),
    drop_off_type: integer('drop_off_type')
      .$type<Departure['dropOffType']>()
      .notNull(),
    timepoint: integer('timepoint').$type<Departure['timepoint']>().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.projection_id,
        table.service_date,
        table.provider_trip_id,
        table.stop_sequence,
      ],
    }),
    foreignKey({
      name: 'scheduled_departure_occurrences_scope_fk',
      columns: [
        table.projection_id,
        table.service_date,
        table.station_id,
        table.line_id,
        table.service_id,
        table.destination_station_id,
      ],
      foreignColumns: [
        scheduledDepartureScopesTable.projection_id,
        scheduledDepartureScopesTable.service_date,
        scheduledDepartureScopesTable.station_id,
        scheduledDepartureScopesTable.line_id,
        scheduledDepartureScopesTable.service_id,
        scheduledDepartureScopesTable.destination_station_id,
      ],
    }).onDelete('cascade'),
    index('scheduled_departure_occurrences_window_idx').on(
      table.projection_id,
      table.service_date,
      table.station_id,
      table.line_id,
      table.service_id,
      table.destination_station_id,
      table.departure_instant,
    ),
    check(
      'scheduled_departure_occurrences_identity',
      sql`${table.stop_sequence} ~ '^[0-9]+$' AND ${table.occurrence_index} >= 0 AND cardinality(${table.platform_ids}) > 0`,
    ),
    check(
      'scheduled_departure_occurrences_access',
      sql`${table.pickup_type} IN (0, 2, 3) AND ${table.drop_off_type} BETWEEN 0 AND 3 AND ${table.timepoint} IN (0, 1)`,
    ),
    check(
      'scheduled_departure_occurrences_timing',
      sql`(${table.arrival_seconds} IS NULL) = (${table.arrival_instant} IS NULL)
        AND (${table.departure_seconds} IS NULL) = (${table.departure_instant} IS NULL)
        AND (${table.arrival_seconds} IS NULL OR ${table.arrival_seconds} BETWEEN 0 AND 9007199254740991)
        AND (${table.departure_seconds} IS NULL OR ${table.departure_seconds} BETWEEN 0 AND 9007199254740991)
        AND (${table.arrival_seconds} IS NULL OR ${table.departure_seconds} IS NULL OR ${table.departure_seconds} >= ${table.arrival_seconds})
        AND (${table.timepoint} = 0 OR (${table.arrival_seconds} IS NOT NULL AND ${table.departure_seconds} IS NOT NULL))`,
    ),
  ],
);
