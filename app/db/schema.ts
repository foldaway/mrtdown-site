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
  ResolvePeriodsEndAtReasonSchema,
  ResolvePeriodsEndAtSourceSchema,
  ResolvePeriodsModeKindSchema,
  type Service,
  ServiceEffectKindSchema,
  ServiceScopeTypeSchema,
  type Station,
  StationStructureTypeSchema,
  type Translations,
  type TranslationsMeta,
} from '@mrtdown/core';
import {
  date,
  foreignKey,
  geometry,
  index,
  integer,
  interval,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { enumToPgEnum, timestampColumns } from './columns.helpers.js';

/*
 * Pull staging (`*_next`): snapshot of manifest data between workflow steps.
 * Spreads below pair staging with live tables so column definitions stay in sync.
 * Staging has no FKs; nested data is JSONB where live uses child tables.
 */

/** Shared by `operators` and `operators_next` (same logical fields). */
const operatorEntitySharedColumns = {
  name: jsonb('name').$type<Translations>().notNull(),
  founded_at: date('founded_at').notNull(),
  url: text('url'),
  hash: text('hash').notNull(),
};

/** Shared by `towns` / `towns_next` and `landmarks` / `landmarks_next`. */
const translationsNamedEntitySharedColumns = {
  name: jsonb('name').$type<Translations>().notNull(),
  hash: text('hash').notNull(),
};

/** Shared name + hash for `stations` / `stations_next`. */
const stationNameHashSharedColumns = {
  name: jsonb('name').$type<Translations>().notNull(),
  hash: text('hash').notNull(),
};

/** PostGIS point (SRID 4326) — shared by `stations` and `stations_next`. */
const stationGeoColumn = {
  geo: geometry('geo', { type: 'point', srid: 4326 }).notNull(),
};

/** Only on `stations_next` (plus shared `geo`). */
const stationStagingExtraColumns = {
  ...stationGeoColumn,
  town_id: text('town_id').notNull(),
  station_codes: jsonb('station_codes')
    .$type<Station['stationCodes']>()
    .notNull(),
  landmark_ids: jsonb('landmark_ids').$type<string[]>().notNull(),
};

/** Shared by `services` and `services_next`. */
const serviceEntitySharedColumns = {
  name: jsonb('name').$type<Translations>().notNull(),
  hash: text('hash').notNull(),
};

/** Only on `services_next`. */
const servicesStagingExtraColumns = {
  line_id: text('line_id').notNull(),
  revisions: jsonb('revisions').$type<Service['revisions']>().notNull(),
};

/** Only on `issues_next`. */
const issuesStagingExtraColumns = {
  evidences: jsonb('evidences').$type<Evidence[]>().notNull(),
  impact_events: jsonb('impact_events').$type<ImpactEvent[]>().notNull(),
};

/** Only on `lines_next` — live `lines` stores operators in `line_operators`. */
const linesStagingExtraColumns = {
  operators: jsonb('operators').$type<Line['operators']>().notNull(),
};

export const metadataTable = pgTable('metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Staging for pull workflow — no FKs; JSONB holds nested child data. */
export const operatorsNextTable = pgTable('operators_next', {
  id: text('id').primaryKey(),
  ...operatorEntitySharedColumns,
});

export const townsNextTable = pgTable('towns_next', {
  id: text('id').primaryKey(),
  ...translationsNamedEntitySharedColumns,
});

export const landmarksNextTable = pgTable('landmarks_next', {
  id: text('id').primaryKey(),
  ...translationsNamedEntitySharedColumns,
});

export const stationsNextTable = pgTable('stations_next', {
  id: text('id').primaryKey(),
  ...stationNameHashSharedColumns,
  ...stationStagingExtraColumns,
});

export const servicesNextTable = pgTable('services_next', {
  id: text('id').primaryKey(),
  ...serviceEntitySharedColumns,
  ...servicesStagingExtraColumns,
});

// Entity Type: PublicHoliday
export const publicHolidaysTable = pgTable('public_holidays', {
  id: text('id').primaryKey(),
  date: date('date').notNull(),
  holiday_name: text('holiday_name').notNull(),
  hash: text('hash').notNull(),
  ...timestampColumns,
});

// Entity Type: Town
export const townsTable = pgTable('towns', {
  id: text('id').primaryKey(),
  ...translationsNamedEntitySharedColumns,
  ...timestampColumns,
});

// Entity Type: Landmark
export const landmarksTable = pgTable('landmarks', {
  id: text('id').primaryKey(),
  ...translationsNamedEntitySharedColumns,
  ...timestampColumns,
});

// Entity Type: Operator
export const operatorsTable = pgTable('operators', {
  id: text('id').primaryKey(),
  ...operatorEntitySharedColumns,
  ...timestampColumns,
});

// Entity Type: Station
export const stationsTable = pgTable('stations', {
  id: text('id').primaryKey(),
  ...stationNameHashSharedColumns,
  ...stationGeoColumn,
  townId: text('town_id')
    .references(() => townsTable.id)
    .notNull(),
  ...timestampColumns,
});

export const lineTypeEnum = pgEnum(
  'line_type',
  enumToPgEnum(LineTypeSchema.enum),
);

/**
 * Shared by `lines` and `lines_next`.
 * Live also uses `line_operators`; staging embeds `operators` JSON on `lines_next` only.
 */
export const lineEntitySharedColumns = {
  name: jsonb('name').$type<Translations>().notNull(),
  type: lineTypeEnum().notNull(),
  color: text('color').notNull(),
  started_at: date('started_at', { mode: 'string' }).notNull(),
  ended_at: date('ended_at', { mode: 'string' }),
  operating_hours: jsonb('operating_hours').$type<OperatingHours>().notNull(),
  hash: text('hash').notNull(),
};

export const linesNextTable = pgTable('lines_next', {
  id: text('id').primaryKey(),
  ...lineEntitySharedColumns,
  ...linesStagingExtraColumns,
});

// Entity Type: Line
export const linesTable = pgTable('lines', {
  id: text('id').primaryKey(),
  ...lineEntitySharedColumns,
  ...timestampColumns,
});

// Normalized Entity Field: Line.operators
export const lineOperatorsTable = pgTable(
  'line_operators',
  {
    line_id: text('line_id')
      .references(() => linesTable.id)
      .notNull(),
    operator_id: text('operator_id')
      .references(() => operatorsTable.id)
      .notNull(),
    started_at: date('started_at', { mode: 'string' }),
    ended_at: date('ended_at', { mode: 'string' }),
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
export const servicesTable = pgTable(
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
export const lineServicesTable = pgTable(
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
export const serviceRevisionsTable = pgTable(
  'service_revisions',
  {
    id: text('id').notNull(),
    service_id: text('service_id')
      .references(() => servicesTable.id)
      .notNull(),
    operating_hours: jsonb('operating_hours').$type<OperatingHours>().notNull(),
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
export const serviceRevisionPathStationEntriesTable = pgTable(
  'service_revision_path_station_entries',
  {
    service_revision_id: text('service_revision_id').notNull(),
    service_id: text('service_id').notNull(),
    station_id: text('station_id')
      .references(() => stationsTable.id)
      .notNull(),
    display_code: text('display_code').notNull(),
    path_index: integer('path_index').notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      foreignKey({
        columns: [table.service_revision_id, table.service_id],
        foreignColumns: [
          serviceRevisionsTable.id,
          serviceRevisionsTable.service_id,
        ],
      }),
      primaryKey({
        columns: [
          table.service_revision_id,
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
      index('service_revision_path_entries_path_index_idx').using(
        'btree',
        table.path_index.asc(),
      ),
    ];
  },
);

export const stationStructureTypeEnum = pgEnum(
  'station_structure_type',
  enumToPgEnum(StationStructureTypeSchema.enum),
);

// Normalized Entity Field: Station.stationCodes
export const stationCodesTable = pgTable(
  'station_codes',
  {
    line_id: text('line_id')
      .references(() => linesTable.id)
      .notNull(),
    station_id: text('station_id')
      .references(() => stationsTable.id)
      .notNull(),
    code: text('code').notNull(),
    started_at: date('started_at').notNull(),
    ended_at: date('ended_at'),
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
export const stationLandmarksTable = pgTable(
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

export const issueTypeEnum = pgEnum(
  'issue_type',
  enumToPgEnum(IssueTypeSchema.enum),
);

/**
 * Shared by `issues` and `issues_next`.
 * Evidences and impact events are JSON on `issues_next` only; live normalizes to child tables.
 */
export const issueEntitySharedColumns = {
  type: issueTypeEnum().notNull(),
  title: jsonb('title').$type<Translations>().notNull(),
  title_meta: jsonb('title_meta').$type<TranslationsMeta>().notNull(),
  hash: text('hash').notNull(),
};

export const issuesNextTable = pgTable('issues_next', {
  id: text('id').primaryKey(),
  ...issueEntitySharedColumns,
  ...issuesStagingExtraColumns,
});

// Entity Type: Issue
export const issuesTable = pgTable('issues', {
  id: text('id').primaryKey(),
  ...issueEntitySharedColumns,
  ...timestampColumns,
});

export const evidenceTypeEnum = pgEnum(
  'evidence_type',
  enumToPgEnum(EvidenceTypeSchema.enum),
);

// EntityType: Evidence
export const evidencesTable = pgTable(
  'evidences',
  {
    id: text('id').primaryKey(),
    ts: timestamp('ts', { withTimezone: true, mode: 'string' }).notNull(),
    text: text('text').notNull(),
    type: evidenceTypeEnum().notNull(),
    render: jsonb('render').$type<EvidenceRender>(),
    source_url: text('source_url').notNull(),
    issue_id: text('issue_id')
      .references(() => issuesTable.id)
      .notNull(),
    ...timestampColumns,
  },
  (table) => {
    return [
      index('evidences_issue_id_idx').on(table.issue_id),
      index('evidences_ts_idx').using('btree', table.ts.desc()),
    ];
  },
);

// Entity Type: ImpactEvent
export const impactEventsTable = pgTable('impact_events', {
  id: text('id').primaryKey(),
  ts: timestamp('ts', { withTimezone: true, mode: 'string' }).notNull(),
  issue_id: text('issue_id')
    .references(() => issuesTable.id)
    .notNull(),
  type: text('type').$type<ImpactEvent['type']>().notNull(),
  ...timestampColumns,
});

// Normalized Entity Field: ImpactEvent.basis.evidenceId
export const impactEventBasisEvidencesTable = pgTable(
  'impact_event_basis_evidences',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id)
      .notNull(),
    evidence_id: text('evidence_id')
      .references(() => evidencesTable.id)
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

export const resolvePeriodsModeKindEnum = pgEnum(
  'resolve_periods_mode_kind',
  enumToPgEnum(ResolvePeriodsModeKindSchema.enum),
);

export const resolvePeriodsEndAtSourceEnum = pgEnum(
  'resolve_periods_end_at_source',
  enumToPgEnum(ResolvePeriodsEndAtSourceSchema.enum),
);

export const resolvePeriodsEndAtReasonEnum = pgEnum(
  'resolve_periods_end_at_reason',
  enumToPgEnum(ResolvePeriodsEndAtReasonSchema.enum),
);

// Normalized Entity Field: ImpactEventPeriodsSet.periods
export const impactEventPeriodsTable = pgTable(
  'impact_event_periods',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id)
      .notNull(),
    index: integer('index').notNull(),
    mode: resolvePeriodsModeKindEnum().notNull(),
    start_at: timestamp('start_ts', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    end_at: timestamp('end_ts', { withTimezone: true, mode: 'string' }),
    end_at_resolved: timestamp('end_ts_resolved', {
      withTimezone: true,
      mode: 'string',
    }),
    end_at_source: resolvePeriodsEndAtSourceEnum().notNull(),
    end_at_reason: resolvePeriodsEndAtReasonEnum(),
    ...timestampColumns,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.impact_event_id, table.index, table.mode] }),
      index('impact_event_periods_set_periods_impact_event_id_idx').on(
        table.impact_event_id,
        table.index,
      ),
      index('impact_event_periods_mode_idx').on(table.mode),
      index('impact_event_periods_start_at_idx').using(
        'btree',
        table.start_at.asc(),
      ),
      index('impact_event_periods_end_at_idx').using(
        'btree',
        table.end_at.asc(),
      ),
      index('impact_event_periods_end_at_resolved_idx').using(
        'btree',
        table.end_at_resolved.asc(),
      ),
      index('impact_event_periods_end_at_source_idx').on(table.end_at_source),
      index('impact_event_periods_end_at_reason_idx').on(table.end_at_reason),
    ];
  },
);

export const impactEventServiceScopeTypeEnum = pgEnum(
  'impact_event_service_scope_type',
  enumToPgEnum(ServiceScopeTypeSchema.enum),
);

// Normalized Entity Field: ImpactEventServiceScopeSet.serviceScopes
export const impactEventServiceScopesTable = pgTable(
  'impact_event_service_scopes',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id)
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
    ];
  },
);

export const serviceEffectKindEnum = pgEnum(
  'service_effect_kind',
  enumToPgEnum(ServiceEffectKindSchema.enum),
);

// Normalized Entity Field: ImpactEventServiceEffectSet.effect (ServiceEffect)
export const impactEventServiceEffectsTable = pgTable(
  'impact_event_service_effects',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id)
      .notNull(),
    kind: serviceEffectKindEnum().notNull(),
    // Present only when kind=delay
    duration: interval('duration'),
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

export const facilityEffectKindEnum = pgEnum(
  'facility_effect_kind',
  enumToPgEnum(FacilityEffectKindSchema.enum),
);

// Normalized Entity Field: ImpactEventFacilityEffectSet.effect (FacilityEffect)
export const impactEventFacilityEffectsTable = pgTable(
  'impact_event_facility_effects',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id)
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
export const impactEventEntityServicesTable = pgTable(
  'impact_event_entity_services',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id)
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

export const affectedEntityFacilityKindEnum = pgEnum(
  'affected_entity_facility_kind',
  enumToPgEnum(AffectedEntityFacilityKindSchema.enum),
);

// Normalized Entity Field: ImpactEvent.entity (AffectedEntityFacility)
export const impactEventEntityFacilitiesTable = pgTable(
  'impact_event_entity_facilities',
  {
    impact_event_id: text('impact_event_id')
      .references(() => impactEventsTable.id)
      .notNull(),
    station_id: text('station_id')
      .references(() => stationsTable.id)
      .notNull(),
    kind: affectedEntityFacilityKindEnum().notNull(),
    ...timestampColumns,
  },
);

export const impactEventCauseTypeEnum = pgEnum(
  'impact_event_cause_type',
  enumToPgEnum({
    ...CauseDisruptionSchema.enum,
    ...CauseMaintenanceSchema.enum,
    ...CauseInfraSchema.enum,
  }),
);

export const impactEventCausesTable = pgTable('impact_event_causes', {
  impact_event_id: text('impact_event_id')
    .references(() => impactEventsTable.id)
    .notNull(),
  type: text('type').notNull(),
  ...timestampColumns,
});
