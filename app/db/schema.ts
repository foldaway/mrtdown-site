import {
  AffectedEntityFacilityKindSchema,
  CauseDisruptionSchema,
  CauseInfraSchema,
  CauseMaintenanceSchema,
  type Evidence,
  type EvidenceRender,
  EvidenceTypeSchema,
  FacilityEffectKindSchema,
  type ImpactEvent,
  IssueTypeSchema,
  type Line,
  LineTypeSchema,
  type OperatingHours,
  type Service,
  ServiceEffectKindSchema,
  ServiceScopeTypeSchema,
  type Station,
  StationStructureTypeSchema,
  type Translations,
  type TranslationsMeta,
} from '@mrtdown/core';
import { IngestContentCrowdReportEffects } from '@mrtdown/ingest-contracts';
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import {
  enumToSqliteEnum,
  jsonText,
  sqliteEnum,
  timestampColumns,
} from './columns.helpers.js';

/*
 * Pull staging (`*_next`): snapshot of manifest data between workflow steps.
 * Spreads below pair staging with live tables so column definitions stay in sync.
 * Staging has no FKs; nested data is JSON text where live uses child tables.
 */

/** Shared by `operators` and `operators_next` (same logical fields). */
const operatorEntitySharedColumns = {
  name: jsonText('name').$type<Translations>().notNull(),
  founded_at: text('founded_at').notNull(),
  url: text('url'),
  hash: text('hash').notNull(),
};

/** Shared by `towns` / `towns_next` and `landmarks` / `landmarks_next`. */
const translationsNamedEntitySharedColumns = {
  name: jsonText('name').$type<Translations>().notNull(),
  hash: text('hash').notNull(),
};

/** Shared name + hash for `stations` / `stations_next`. */
const stationNameHashSharedColumns = {
  name: jsonText('name').$type<Translations>().notNull(),
  hash: text('hash').notNull(),
};

/** WGS84 station coordinates — shared by `stations` and `stations_next`. */
const stationCoordinateColumns = {
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
};

/** Only on `stations_next` (plus shared coordinates). */
const stationStagingExtraColumns = {
  ...stationCoordinateColumns,
  town_id: text('town_id').notNull(),
  station_codes: jsonText('station_codes')
    .$type<Station['stationCodes']>()
    .notNull(),
  landmark_ids: jsonText('landmark_ids').$type<string[]>().notNull(),
};

/** Shared by `services` and `services_next`. */
const serviceEntitySharedColumns = {
  name: jsonText('name').$type<Translations>().notNull(),
  hash: text('hash').notNull(),
};

/** Only on `services_next`. */
const servicesStagingExtraColumns = {
  line_id: text('line_id').notNull(),
  revisions: jsonText('revisions').$type<Service['revisions']>().notNull(),
};

/** Only on `issues_next`. */
const issuesStagingExtraColumns = {
  evidences: jsonText('evidences').$type<Evidence[]>().notNull(),
  impact_events: jsonText('impact_events').$type<ImpactEvent[]>().notNull(),
};

/** Only on `lines_next` — live `lines` stores operators in `line_operators`. */
const linesStagingExtraColumns = {
  operators: jsonText('operators').$type<Line['operators']>().notNull(),
};

export const metadataTable = sqliteTable('metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Staging for pull workflow — no FKs; JSON text holds nested child data. */
export const operatorsNextTable = sqliteTable('operators_next', {
  id: text('id').primaryKey(),
  ...operatorEntitySharedColumns,
});

export const townsNextTable = sqliteTable('towns_next', {
  id: text('id').primaryKey(),
  ...translationsNamedEntitySharedColumns,
});

export const landmarksNextTable = sqliteTable('landmarks_next', {
  id: text('id').primaryKey(),
  ...translationsNamedEntitySharedColumns,
});

export const stationsNextTable = sqliteTable(
  'stations_next',
  {
    id: text('id').primaryKey(),
    ...stationNameHashSharedColumns,
    ...stationStagingExtraColumns,
  },
  (table) => {
    return [
      index('stations_next_coordinates_idx').on(
        table.latitude,
        table.longitude,
      ),
    ];
  },
);

export const servicesNextTable = sqliteTable('services_next', {
  id: text('id').primaryKey(),
  ...serviceEntitySharedColumns,
  ...servicesStagingExtraColumns,
});

// Entity Type: PublicHoliday
export const publicHolidaysTable = sqliteTable('public_holidays', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  holiday_name: text('holiday_name').notNull(),
  hash: text('hash').notNull(),
  ...timestampColumns,
});

export const crowdReportEffectEnum = sqliteEnum(
  'crowd_report_effect',
  IngestContentCrowdReportEffects,
);

export const crowdReportStatusEnum = sqliteEnum('crowd_report_status', [
  'pending',
  'accepted',
  'rejected',
  'duplicate',
  'dispatched',
]);

export const crowdReportClusterStatusEnum = sqliteEnum(
  'crowd_report_cluster_status',
  ['pending', 'accepted', 'rejected', 'dispatched'],
);

export const crowdReportClustersTable = sqliteTable(
  'crowd_report_clusters',
  {
    id: text('id').primaryKey(),
    effect: crowdReportEffectEnum(),
    window_start_at: text('window_start_at').notNull(),
    window_end_at: text('window_end_at').notNull(),
    report_count: integer('report_count').notNull().default(0),
    status: crowdReportClusterStatusEnum().notNull().default('pending'),
    dispatched_at: text('dispatched_at'),
    ...timestampColumns,
  },
  (table) => {
    return [
      index('crowd_report_clusters_status_idx').on(table.status),
      index('crowd_report_clusters_window_start_at_idx').on(
        table.window_start_at,
      ),
    ];
  },
);

// Clusters carry affected-area scope through line/station joins; do not treat a
// cluster as displayable or dispatchable unless at least one join exists.
export const crowdReportClusterLinesTable = sqliteTable(
  'crowd_report_cluster_lines',
  {
    cluster_id: text('cluster_id')
      .references(() => crowdReportClustersTable.id, { onDelete: 'cascade' })
      .notNull(),
    line_id: text('line_id')
      .references(() => linesTable.id)
      .notNull(),
  },
  (table) => {
    return [
      primaryKey({ columns: [table.cluster_id, table.line_id] }),
      index('crowd_report_cluster_lines_line_id_idx').on(table.line_id),
    ];
  },
);

export const crowdReportClusterStationsTable = sqliteTable(
  'crowd_report_cluster_stations',
  {
    cluster_id: text('cluster_id')
      .references(() => crowdReportClustersTable.id, { onDelete: 'cascade' })
      .notNull(),
    station_id: text('station_id')
      .references(() => stationsTable.id)
      .notNull(),
  },
  (table) => {
    return [
      primaryKey({ columns: [table.cluster_id, table.station_id] }),
      index('crowd_report_cluster_stations_station_id_idx').on(
        table.station_id,
      ),
    ];
  },
);

export const crowdReportsTable = sqliteTable(
  'crowd_reports',
  {
    id: text('id').primaryKey(),
    observed_at: text('observed_at').notNull(),
    direction_text: text('direction_text'),
    effect: crowdReportEffectEnum(),
    delay_minutes: integer('delay_minutes'),
    still_happening: integer('still_happening', { mode: 'boolean' }),
    text: text('text').notNull(),
    status: crowdReportStatusEnum().notNull().default('pending'),
    cluster_id: text('cluster_id').references(
      () => crowdReportClustersTable.id,
    ),
    duplicate_of_id: text('duplicate_of_id').references(
      (): AnySQLiteColumn => crowdReportsTable.id,
      { onDelete: 'set null' },
    ),
    dispatched_at: text('dispatched_at'),
    dispatch_payload: jsonText('dispatch_payload').$type<unknown>(),
    dispatch_error: text('dispatch_error'),
    ...timestampColumns,
  },
  (table) => {
    return [
      index('crowd_reports_observed_at_idx').on(table.observed_at),
      index('crowd_reports_status_idx').on(table.status),
      index('crowd_reports_cluster_id_idx').on(table.cluster_id),
      index('crowd_reports_duplicate_of_id_idx').on(table.duplicate_of_id),
      check(
        'crowd_reports_delay_minutes_check',
        sql`${table.delay_minutes} is null or (${table.delay_minutes} >= 0 and ${table.delay_minutes} <= 180)`,
      ),
    ];
  },
);

export const crowdReportLinesTable = sqliteTable(
  'crowd_report_lines',
  {
    report_id: text('report_id')
      .references(() => crowdReportsTable.id, { onDelete: 'cascade' })
      .notNull(),
    line_id: text('line_id')
      .references(() => linesTable.id)
      .notNull(),
  },
  (table) => {
    return [
      primaryKey({ columns: [table.report_id, table.line_id] }),
      index('crowd_report_lines_line_id_idx').on(table.line_id),
    ];
  },
);

export const crowdReportStationsTable = sqliteTable(
  'crowd_report_stations',
  {
    report_id: text('report_id')
      .references(() => crowdReportsTable.id, { onDelete: 'cascade' })
      .notNull(),
    station_id: text('station_id')
      .references(() => stationsTable.id)
      .notNull(),
  },
  (table) => {
    return [
      primaryKey({ columns: [table.report_id, table.station_id] }),
      index('crowd_report_stations_station_id_idx').on(table.station_id),
    ];
  },
);

export const crowdReportModerationEventsTable = sqliteTable(
  'crowd_report_moderation_events',
  {
    id: text('id').primaryKey(),
    report_id: text('report_id')
      .references(() => crowdReportsTable.id, { onDelete: 'cascade' })
      .notNull(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    note: text('note'),
    created_at: timestampColumns.created_at,
  },
  (table) => {
    return [
      index('crowd_report_moderation_events_report_id_idx').on(table.report_id),
      index('crowd_report_moderation_events_created_at_idx').on(
        table.created_at,
      ),
    ];
  },
);

export const crowdReportRateLimitsTable = sqliteTable(
  'crowd_report_rate_limits',
  {
    ip_hash: text('ip_hash').notNull(),
    bucket_start_at: text('bucket_start_at').notNull(),
    submission_count: integer('submission_count').notNull().default(0),
    client_fingerprint_hash: text('client_fingerprint_hash'),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.ip_hash, table.bucket_start_at] }),
      index('crowd_report_rate_limits_bucket_start_at_idx').on(
        table.bucket_start_at,
      ),
    ];
  },
);

export const crowdReportAbuseEventsTable = sqliteTable(
  'crowd_report_abuse_events',
  {
    id: text('id').primaryKey(),
    report_id: text('report_id').references(() => crowdReportsTable.id, {
      onDelete: 'cascade',
    }),
    ip_hash: text('ip_hash').notNull(),
    user_agent_hash: text('user_agent_hash'),
    client_fingerprint_hash: text('client_fingerprint_hash'),
    turnstile_token_hash: text('turnstile_token_hash'),
    turnstile_outcome: text('turnstile_outcome').notNull(),
    rate_limit_bucket_start_at: text('rate_limit_bucket_start_at').notNull(),
    created_at: timestampColumns.created_at,
  },
  (table) => {
    return [
      index('crowd_report_abuse_events_report_id_idx').on(table.report_id),
      index('crowd_report_abuse_events_ip_hash_created_at_idx').on(
        table.ip_hash,
        table.created_at,
      ),
    ];
  },
);

// Entity Type: Town
export const townsTable = sqliteTable('towns', {
  id: text('id').primaryKey(),
  ...translationsNamedEntitySharedColumns,
  ...timestampColumns,
});

// Entity Type: Landmark
export const landmarksTable = sqliteTable('landmarks', {
  id: text('id').primaryKey(),
  ...translationsNamedEntitySharedColumns,
  ...timestampColumns,
});

// Entity Type: Operator
export const operatorsTable = sqliteTable('operators', {
  id: text('id').primaryKey(),
  ...operatorEntitySharedColumns,
  ...timestampColumns,
});

// Entity Type: Station
export const stationsTable = sqliteTable(
  'stations',
  {
    id: text('id').primaryKey(),
    ...stationNameHashSharedColumns,
    ...stationCoordinateColumns,
    townId: text('town_id')
      .references(() => townsTable.id)
      .notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      index('stations_coordinates_idx').on(table.latitude, table.longitude),
    ];
  },
);

export const lineTypeEnum = sqliteEnum(
  'line_type',
  enumToSqliteEnum(LineTypeSchema.enum),
);

/**
 * Shared by `lines` and `lines_next`.
 * Live also uses `line_operators`; staging embeds `operators` JSON on `lines_next` only.
 */
export const lineEntitySharedColumns = {
  name: jsonText('name').$type<Translations>().notNull(),
  type: lineTypeEnum().notNull(),
  color: text('color').notNull(),
  started_at: text('started_at').notNull(),
  ended_at: text('ended_at'),
  operating_hours: jsonText('operating_hours')
    .$type<OperatingHours>()
    .notNull(),
  hash: text('hash').notNull(),
};

export const linesNextTable = sqliteTable('lines_next', {
  id: text('id').primaryKey(),
  ...lineEntitySharedColumns,
  ...linesStagingExtraColumns,
});

// Entity Type: Line
export const linesTable = sqliteTable('lines', {
  id: text('id').primaryKey(),
  ...lineEntitySharedColumns,
  ...timestampColumns,
});

// Normalized Entity Field: Line.operators
export const lineOperatorsTable = sqliteTable(
  'line_operators',
  {
    line_id: text('line_id')
      .references(() => linesTable.id)
      .notNull(),
    operator_id: text('operator_id')
      .references(() => operatorsTable.id)
      .notNull(),
    started_at: text('started_at'),
    ended_at: text('ended_at'),
    hash: text('hash').notNull(),
  },
  (table) => {
    return [
      primaryKey({ columns: [table.line_id, table.operator_id] }),
      index('line_operators_line_id_idx').on(table.line_id),
      index('line_operators_operator_id_idx').on(table.operator_id),
    ];
  },
);

// Entity Type: services
export const servicesTable = sqliteTable(
  'services',
  {
    id: text('id').primaryKey(),
    line_id: text('line_id')
      .references(() => linesTable.id)
      .notNull(),
    ...serviceEntitySharedColumns,
    ...timestampColumns,
  },
  (table) => {
    return [index('services_line_id_idx').on(table.line_id)];
  },
);

// Normalized Entity Field: Line.services / Service.lineId
export const lineServicesTable = sqliteTable(
  'line_services',
  {
    line_id: text('line_id')
      .references(() => linesTable.id)
      .notNull(),
    service_id: text('service_id')
      .references(() => servicesTable.id)
      .notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.line_id, table.service_id] }),
      index('line_services_line_id_idx').on(table.line_id),
      index('line_services_service_id_idx').on(table.service_id),
    ];
  },
);

// Entity Type: ServiceRevision
export const serviceRevisionsTable = sqliteTable(
  'service_revisions',
  {
    id: text('id').notNull(),
    service_id: text('service_id')
      .references(() => servicesTable.id)
      .notNull(),
    start_at: text('start_at'),
    end_at: text('end_at'),
    operating_hours: jsonText('operating_hours')
      .$type<OperatingHours>()
      .notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.id, table.service_id] }),
      index('service_revisions_service_id_idx').on(table.service_id),
    ];
  },
);

// Normalized Entity Field: ServiceRevision.path.stations
export const serviceRevisionPathStationEntriesTable = sqliteTable(
  'service_revision_path_station_entries',
  {
    service_revision_id: text('service_revision_id').notNull(),
    service_id: text('service_id').notNull(),
    station_id: text('station_id').notNull(),
    display_code: text('display_code').notNull(),
    path_index: integer('path_index').notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      foreignKey({
        name: 'sr_path_entries_revision_fk',
        columns: [table.service_revision_id, table.service_id],
        foreignColumns: [
          serviceRevisionsTable.id,
          serviceRevisionsTable.service_id,
        ],
      }),
      foreignKey({
        name: 'sr_path_entries_station_fk',
        columns: [table.station_id],
        foreignColumns: [stationsTable.id],
      }),
      primaryKey({
        name: 'sr_path_entries_pk',
        columns: [
          table.service_revision_id,
          table.service_id,
          table.station_id,
          table.path_index,
        ],
      }),
      index('service_revision_path_entries_service_revision_id_idx').on(
        table.service_revision_id,
      ),
      index('service_revision_path_entries_service_id_idx').on(
        table.service_id,
      ),
      index('service_revision_path_entries_station_id_idx').on(
        table.station_id,
      ),
      index('service_revision_path_entries_path_index_idx').on(
        table.path_index,
      ),
    ];
  },
);

export const stationStructureTypeEnum = sqliteEnum(
  'station_structure_type',
  enumToSqliteEnum(StationStructureTypeSchema.enum),
);

// Normalized Entity Field: Station.stationCodes
export const stationCodesTable = sqliteTable(
  'station_codes',
  {
    line_id: text('line_id')
      .references(() => linesTable.id)
      .notNull(),
    station_id: text('station_id')
      .references(() => stationsTable.id)
      .notNull(),
    code: text('code').notNull(),
    started_at: text('started_at').notNull(),
    ended_at: text('ended_at'),
    structure_type: stationStructureTypeEnum().notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.line_id, table.station_id, table.code] }),
      index('station_codes_line_id_idx').on(table.line_id),
      index('station_codes_station_id_idx').on(table.station_id),
    ];
  },
);

// Normalized Entity Field: Station.landmarkIds
export const stationLandmarksTable = sqliteTable(
  'station_landmarks',
  {
    station_id: text('station_id')
      .references(() => stationsTable.id)
      .notNull(),
    landmark_id: text('landmark_id')
      .references(() => landmarksTable.id)
      .notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.station_id, table.landmark_id] }),
      index('station_landmarks_station_id_idx').on(table.station_id),
      index('station_landmarks_landmark_id_idx').on(table.landmark_id),
    ];
  },
);

export const issueTypeEnum = sqliteEnum(
  'issue_type',
  enumToSqliteEnum(IssueTypeSchema.enum),
);

/**
 * Shared by `issues` and `issues_next`.
 * Evidences and impact events are JSON on `issues_next` only; live normalizes to child tables.
 */
export const issueEntitySharedColumns = {
  type: issueTypeEnum().notNull(),
  title: jsonText('title').$type<Translations>().notNull(),
  title_meta: jsonText('title_meta').$type<TranslationsMeta>().notNull(),
  hash: text('hash').notNull(),
};

export const issuesNextTable = sqliteTable('issues_next', {
  id: text('id').primaryKey(),
  ...issueEntitySharedColumns,
  ...issuesStagingExtraColumns,
});

// Entity Type: Issue
export const issuesTable = sqliteTable('issues', {
  id: text('id').primaryKey(),
  ...issueEntitySharedColumns,
  ...timestampColumns,
});

export const evidenceTypeEnum = sqliteEnum(
  'evidence_type',
  enumToSqliteEnum(EvidenceTypeSchema.enum),
);

// EntityType: Evidence
export const evidencesTable = sqliteTable(
  'evidences',
  {
    id: text('id').primaryKey(),
    ts: text('ts').notNull(),
    text: text('text').notNull(),
    type: evidenceTypeEnum().notNull(),
    render: jsonText('render').$type<EvidenceRender>(),
    source_url: text('source_url').notNull(),
    issue_id: text('issue_id')
      .references(() => issuesTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      index('evidences_issue_id_idx').on(table.issue_id),
      index('evidences_ts_idx').on(table.ts),
    ];
  },
);

// Entity Type: ImpactEvent
export const impactEventsTable = sqliteTable(
  'impact_events',
  {
    id: text('id').primaryKey(),
    ts: text('ts').notNull(),
    issue_id: text('issue_id')
      .references(() => issuesTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    type: text('type').$type<ImpactEvent['type']>().notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [index('impact_events_issue_id_idx').on(table.issue_id)];
  },
);

// Normalized Entity Field: ImpactEvent.basis.evidenceId
export const impactEventBasisEvidencesTable = sqliteTable(
  'impact_event_basis_evidences',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    evidence_id: text('evidence_id')
      .references(() => evidencesTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.impact_event_id, table.evidence_id] }),
      index('impact_event_basis_evidences_impact_event_id_idx').on(
        table.impact_event_id,
      ),
      index('impact_event_basis_evidences_evidence_id_idx').on(
        table.evidence_id,
      ),
    ];
  },
);

// Canonical periods as emitted by `periods.set` events. Operational resolution is
// derived at read time or during analytics fact generation.
export const impactEventPeriodsTable = sqliteTable(
  'impact_event_periods',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    index: integer('index').notNull(),
    start_at: text('start_ts').notNull(),
    end_at: text('end_ts'),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.impact_event_id, table.index] }),
      index('impact_event_periods_start_at_idx').on(table.start_at),
      index('impact_event_periods_end_at_idx').on(table.end_at),
    ];
  },
);

// Derived daily issue facts. These are rebuildable analytics outputs rather than
// canonical source data, and may depend on `resolvePeriods(... kind: operational)`.
export const issueDayFactsTable = sqliteTable(
  'issue_day_facts',
  {
    date: text('date').notNull(),
    issue_id: text('issue_id')
      .references(() => issuesTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    issue_type: issueTypeEnum().notNull(),
    as_of: text('as_of').notNull(),
    active_anytime: integer('active_anytime', { mode: 'boolean' }).notNull(),
    active_end_of_day: integer('active_end_of_day', {
      mode: 'boolean',
    }).notNull(),
    duration_seconds: integer('duration_seconds').notNull(),
    inferred_interval_count: integer('inferred_interval_count').notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.date, table.issue_id] }),
      index('issue_day_facts_issue_id_idx').on(table.issue_id),
      index('issue_day_facts_date_issue_type_idx').on(
        table.date,
        table.issue_type,
      ),
      index('issue_day_facts_as_of_idx').on(table.as_of),
    ];
  },
);

// Derived daily uptime and incident facts per line. This is the intended landing
// zone for analytical queries that would otherwise need to recompute operational
// periods across the full issue history on every request.
export const lineDayFactsTable = sqliteTable(
  'line_day_facts',
  {
    date: text('date').notNull(),
    line_id: text('line_id')
      .references(() => linesTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    as_of: text('as_of').notNull(),
    service_seconds: integer('service_seconds').notNull(),
    downtime_disruption_seconds: integer(
      'downtime_disruption_seconds',
    ).notNull(),
    downtime_maintenance_seconds: integer(
      'downtime_maintenance_seconds',
    ).notNull(),
    downtime_infra_seconds: integer('downtime_infra_seconds').notNull(),
    issue_count_disruption: integer('issue_count_disruption').notNull(),
    issue_count_maintenance: integer('issue_count_maintenance').notNull(),
    issue_count_infra: integer('issue_count_infra').notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.date, table.line_id] }),
      index('line_day_facts_line_id_idx').on(table.line_id),
      index('line_day_facts_date_idx').on(table.date),
      index('line_day_facts_as_of_idx').on(table.as_of),
    ];
  },
);

// Precomputed public statistics payload. This keeps chart assembly off the SSR
// request path while preserving a rebuildable fallback.
export const statisticsSnapshotsTable = sqliteTable(
  'statistics_snapshots',
  {
    id: text('id').primaryKey(),
    as_of: text('as_of').notNull(),
    data: jsonText('data').$type<unknown>().notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [index('statistics_snapshots_as_of_idx').on(table.as_of)];
  },
);

export const impactEventServiceScopeTypeEnum = sqliteEnum(
  'impact_event_service_scope_type',
  enumToSqliteEnum(ServiceScopeTypeSchema.enum),
);

// Normalized Entity Field: ImpactEventServiceScopeSet.serviceScopes
export const impactEventServiceScopesTable = sqliteTable(
  'impact_event_service_scopes',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    index: integer('index').notNull(),
    type: impactEventServiceScopeTypeEnum().notNull(),
    // NOTE: These fields are nullable because they are dependent on the `type` field.
    station_id: text('station_id').references(() => stationsTable.id),
    from_station_id: text('from_station_id').references(() => stationsTable.id),
    to_station_id: text('to_station_id').references(() => stationsTable.id),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.impact_event_id, table.index] }),
      index('impact_event_service_scopes_impact_event_id_idx').on(
        table.impact_event_id,
      ),
      index('impact_event_service_scopes_type_idx').on(table.type),
      index('impact_event_service_scopes_station_id_idx').on(table.station_id),
      index('impact_event_service_scopes_from_station_id_idx').on(
        table.from_station_id,
      ),
      index('impact_event_service_scopes_to_station_id_idx').on(
        table.to_station_id,
      ),
      check(
        'impact_event_service_scopes_type_station_shape_check',
        sql`
          (
            ${table.type} = 'service.whole'
            and ${table.station_id} is null
            and ${table.from_station_id} is null
            and ${table.to_station_id} is null
          )
          or (
            ${table.type} = 'service.point'
            and ${table.station_id} is not null
            and ${table.from_station_id} is null
            and ${table.to_station_id} is null
          )
          or (
            ${table.type} = 'service.segment'
            and ${table.station_id} is null
            and ${table.from_station_id} is not null
            and ${table.to_station_id} is not null
          )
        `,
      ),
    ];
  },
);

export const serviceEffectKindEnum = sqliteEnum(
  'service_effect_kind',
  enumToSqliteEnum(ServiceEffectKindSchema.enum),
);

// Normalized Entity Field: ImpactEventServiceEffectSet.effect (ServiceEffect)
export const impactEventServiceEffectsTable = sqliteTable(
  'impact_event_service_effects',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    kind: serviceEffectKindEnum().notNull(),
    // Present only when kind=delay.
    duration: text('duration'),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.impact_event_id, table.kind] }),
      index('impact_event_service_effects_impact_event_id_idx').on(
        table.impact_event_id,
      ),
      index('impact_event_service_effects_kind_idx').on(table.kind),
    ];
  },
);

export const facilityEffectKindEnum = sqliteEnum(
  'facility_effect_kind',
  enumToSqliteEnum(FacilityEffectKindSchema.enum),
);

// Normalized Entity Field: ImpactEventFacilityEffectSet.effect (FacilityEffect)
export const impactEventFacilityEffectsTable = sqliteTable(
  'impact_event_facility_effects',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    kind: facilityEffectKindEnum().notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.impact_event_id, table.kind] }),
      index('impact_event_facility_effects_impact_event_id_idx').on(
        table.impact_event_id,
      ),
      index('impact_event_facility_effects_kind_idx').on(table.kind),
    ];
  },
);

// Normalized Entity Field: ImpactEvent.entity (AffectedEntityService)
export const impactEventEntityServicesTable = sqliteTable(
  'impact_event_entity_services',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    service_id: text('service_id')
      .references(() => servicesTable.id)
      .notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.impact_event_id, table.service_id] }),
      index('impact_event_entity_services_impact_event_id_idx').on(
        table.impact_event_id,
      ),
      index('impact_event_entity_services_service_id_idx').on(table.service_id),
    ];
  },
);

export const affectedEntityFacilityKindEnum = sqliteEnum(
  'affected_entity_facility_kind',
  enumToSqliteEnum(AffectedEntityFacilityKindSchema.enum),
);

// Normalized Entity Field: ImpactEvent.entity (AffectedEntityFacility)
export const impactEventEntityFacilitiesTable = sqliteTable(
  'impact_event_entity_facilities',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    station_id: text('station_id')
      .references(() => stationsTable.id)
      .notNull(),
    line_id: text('line_id').references(() => linesTable.id),
    kind: affectedEntityFacilityKindEnum().notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({
        columns: [table.impact_event_id, table.station_id, table.kind],
      }),
      index('impact_event_entity_facilities_impact_event_id_idx').on(
        table.impact_event_id,
      ),
      index('impact_event_entity_facilities_station_id_idx').on(
        table.station_id,
      ),
      index('impact_event_entity_facilities_line_id_idx').on(table.line_id),
    ];
  },
);

export const impactEventCauseTypeEnum = sqliteEnum(
  'impact_event_cause_type',
  enumToSqliteEnum({
    ...CauseDisruptionSchema.enum,
    ...CauseMaintenanceSchema.enum,
    ...CauseInfraSchema.enum,
  }),
);

export const impactEventCausesTable = sqliteTable(
  'impact_event_causes',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    type: impactEventCauseTypeEnum().notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.impact_event_id, table.type] }),
      index('impact_event_causes_impact_event_id_idx').on(
        table.impact_event_id,
      ),
    ];
  },
);
