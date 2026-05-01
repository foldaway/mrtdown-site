CREATE TYPE "public"."affected_entity_facility_kind" AS ENUM('lift', 'escalator', 'screen-door');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('official-statement', 'public.report', 'media.report');--> statement-breakpoint
CREATE TYPE "public"."facility_effect_kind" AS ENUM('facility-out-of-service', 'facility-degraded');--> statement-breakpoint
CREATE TYPE "public"."impact_event_cause_type" AS ENUM('signal.fault', 'track.fault', 'train.fault', 'power.fault', 'station.fault', 'security', 'weather', 'passenger.incident', 'platform_door.fault', 'delay', 'track.work', 'system.upgrade', 'elevator.outage', 'escalator.outage', 'air_conditioning.issue', 'station.renovation');--> statement-breakpoint
CREATE TYPE "public"."impact_event_service_scope_type" AS ENUM('service.whole', 'service.segment', 'service.point');--> statement-breakpoint
CREATE TYPE "public"."issue_type" AS ENUM('disruption', 'maintenance', 'infra');--> statement-breakpoint
CREATE TYPE "public"."line_type" AS ENUM('mrt.high', 'mrt.medium', 'lrt');--> statement-breakpoint
CREATE TYPE "public"."resolve_periods_end_at_reason" AS ENUM('crowd_decay', 'evidence_timeout');--> statement-breakpoint
CREATE TYPE "public"."resolve_periods_end_at_source" AS ENUM('fact', 'inferred', 'none');--> statement-breakpoint
CREATE TYPE "public"."resolve_periods_mode_kind" AS ENUM('canonical', 'operational');--> statement-breakpoint
CREATE TYPE "public"."service_effect_kind" AS ENUM('delay', 'no-service', 'reduced-service', 'service-hours-adjustment');--> statement-breakpoint
CREATE TYPE "public"."station_structure_type" AS ENUM('elevated', 'underground', 'at_grade', 'in_building');--> statement-breakpoint
CREATE TABLE "evidences" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"text" text NOT NULL,
	"type" "evidence_type" NOT NULL,
	"render" jsonb,
	"source_url" text NOT NULL,
	"issue_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impact_event_basis_evidences" (
	"impact_event_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impact_event_basis_evidences_impact_event_id_evidence_id_pk" PRIMARY KEY("impact_event_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "impact_event_causes" (
	"impact_event_id" text NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impact_event_entity_facilities" (
	"impact_event_id" text NOT NULL,
	"station_id" text NOT NULL,
	"kind" "affected_entity_facility_kind" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impact_event_entity_services" (
	"impact_event_id" text NOT NULL,
	"service_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impact_event_entity_services_impact_event_id_service_id_pk" PRIMARY KEY("impact_event_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "impact_event_facility_effects" (
	"impact_event_id" text NOT NULL,
	"kind" "facility_effect_kind" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impact_event_facility_effects_impact_event_id_kind_pk" PRIMARY KEY("impact_event_id","kind")
);
--> statement-breakpoint
CREATE TABLE "impact_event_periods" (
	"impact_event_id" text NOT NULL,
	"index" integer NOT NULL,
	"mode" "resolve_periods_mode_kind" NOT NULL,
	"start_ts" timestamp with time zone NOT NULL,
	"end_ts" timestamp with time zone,
	"end_ts_resolved" timestamp with time zone,
	"end_at_source" "resolve_periods_end_at_source" NOT NULL,
	"end_at_reason" "resolve_periods_end_at_reason",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impact_event_periods_impact_event_id_index_mode_pk" PRIMARY KEY("impact_event_id","index","mode")
);
--> statement-breakpoint
CREATE TABLE "impact_event_service_effects" (
	"impact_event_id" text NOT NULL,
	"kind" "service_effect_kind" NOT NULL,
	"duration" interval,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impact_event_service_effects_impact_event_id_kind_pk" PRIMARY KEY("impact_event_id","kind")
);
--> statement-breakpoint
CREATE TABLE "impact_event_service_scopes" (
	"impact_event_id" text NOT NULL,
	"index" integer NOT NULL,
	"type" "impact_event_service_scope_type" NOT NULL,
	"station_id" text,
	"from_station_id" text,
	"to_station_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impact_event_service_scopes_impact_event_id_index_pk" PRIMARY KEY("impact_event_id","index")
);
--> statement-breakpoint
CREATE TABLE "impact_events" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"issue_id" text NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues_next" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "issue_type" NOT NULL,
	"title" jsonb NOT NULL,
	"title_meta" jsonb NOT NULL,
	"hash" text NOT NULL,
	"evidences" jsonb NOT NULL,
	"impact_events" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "issue_type" NOT NULL,
	"title" jsonb NOT NULL,
	"title_meta" jsonb NOT NULL,
	"hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landmarks_next" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_operators" (
	"line_id" text NOT NULL,
	"operator_id" text NOT NULL,
	"started_at" date,
	"ended_at" date,
	"hash" text NOT NULL,
	CONSTRAINT "line_operators_line_id_operator_id_pk" PRIMARY KEY("line_id","operator_id")
);
--> statement-breakpoint
CREATE TABLE "line_services" (
	"line_id" text NOT NULL,
	"service_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_services_line_id_service_id_pk" PRIMARY KEY("line_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "lines_next" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"type" "line_type" NOT NULL,
	"color" text NOT NULL,
	"started_at" date NOT NULL,
	"ended_at" date,
	"operating_hours" jsonb NOT NULL,
	"hash" text NOT NULL,
	"operators" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lines" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"type" "line_type" NOT NULL,
	"color" text NOT NULL,
	"started_at" date NOT NULL,
	"ended_at" date,
	"operating_hours" jsonb NOT NULL,
	"hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operators_next" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"founded_at" date NOT NULL,
	"url" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"founded_at" date NOT NULL,
	"url" text,
	"hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_holidays" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"holiday_name" text NOT NULL,
	"hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_revision_path_station_entries" (
	"service_revision_id" text NOT NULL,
	"service_id" text NOT NULL,
	"station_id" text NOT NULL,
	"display_code" text NOT NULL,
	"path_index" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_revision_path_station_entries_service_revision_id_station_id_path_index_pk" PRIMARY KEY("service_revision_id","station_id","path_index")
);
--> statement-breakpoint
CREATE TABLE "service_revisions" (
	"id" text NOT NULL,
	"service_id" text NOT NULL,
	"operating_hours" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_revisions_id_service_id_pk" PRIMARY KEY("id","service_id")
);
--> statement-breakpoint
CREATE TABLE "services_next" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"hash" text NOT NULL,
	"line_id" text NOT NULL,
	"revisions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"line_id" text NOT NULL,
	"name" jsonb NOT NULL,
	"hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_codes" (
	"line_id" text NOT NULL,
	"station_id" text NOT NULL,
	"code" text NOT NULL,
	"started_at" date NOT NULL,
	"ended_at" date,
	"structure_type" "station_structure_type" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_codes_line_id_station_id_code_pk" PRIMARY KEY("line_id","station_id","code")
);
--> statement-breakpoint
CREATE TABLE "station_landmarks" (
	"station_id" text NOT NULL,
	"landmark_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_landmarks_station_id_landmark_id_pk" PRIMARY KEY("station_id","landmark_id")
);
--> statement-breakpoint
CREATE TABLE "stations_next" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"hash" text NOT NULL,
	"geo" geometry(point) NOT NULL,
	"town_id" text NOT NULL,
	"station_codes" jsonb NOT NULL,
	"landmark_ids" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"hash" text NOT NULL,
	"geo" geometry(point) NOT NULL,
	"town_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "towns_next" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "towns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_basis_evidences" ADD CONSTRAINT "impact_event_basis_evidences_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_basis_evidences" ADD CONSTRAINT "impact_event_basis_evidences_evidence_id_evidences_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_causes" ADD CONSTRAINT "impact_event_causes_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_entity_facilities" ADD CONSTRAINT "impact_event_entity_facilities_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_entity_facilities" ADD CONSTRAINT "impact_event_entity_facilities_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_entity_services" ADD CONSTRAINT "impact_event_entity_services_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_entity_services" ADD CONSTRAINT "impact_event_entity_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_facility_effects" ADD CONSTRAINT "impact_event_facility_effects_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_periods" ADD CONSTRAINT "impact_event_periods_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_service_effects" ADD CONSTRAINT "impact_event_service_effects_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_service_scopes" ADD CONSTRAINT "impact_event_service_scopes_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_service_scopes" ADD CONSTRAINT "impact_event_service_scopes_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_service_scopes" ADD CONSTRAINT "impact_event_service_scopes_from_station_id_stations_id_fk" FOREIGN KEY ("from_station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_event_service_scopes" ADD CONSTRAINT "impact_event_service_scopes_to_station_id_stations_id_fk" FOREIGN KEY ("to_station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_events" ADD CONSTRAINT "impact_events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_operators" ADD CONSTRAINT "line_operators_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_operators" ADD CONSTRAINT "line_operators_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_services" ADD CONSTRAINT "line_services_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_services" ADD CONSTRAINT "line_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_revision_path_station_entries" ADD CONSTRAINT "service_revision_path_station_entries_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_revision_path_station_entries" ADD CONSTRAINT "service_revision_path_station_entries_service_revision_id_service_id_service_revisions_id_service_id_fk" FOREIGN KEY ("service_revision_id","service_id") REFERENCES "public"."service_revisions"("id","service_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_revisions" ADD CONSTRAINT "service_revisions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_codes" ADD CONSTRAINT "station_codes_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_codes" ADD CONSTRAINT "station_codes_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_landmarks" ADD CONSTRAINT "station_landmarks_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_landmarks" ADD CONSTRAINT "station_landmarks_landmark_id_landmarks_id_fk" FOREIGN KEY ("landmark_id") REFERENCES "public"."landmarks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_town_id_towns_id_fk" FOREIGN KEY ("town_id") REFERENCES "public"."towns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidences_issue_id_idx" ON "evidences" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "evidences_ts_idx" ON "evidences" USING btree ("ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "impact_event_basis_evidences_impact_event_id_idx" ON "impact_event_basis_evidences" USING btree ("impact_event_id");--> statement-breakpoint
CREATE INDEX "impact_event_basis_evidences_evidence_id_idx" ON "impact_event_basis_evidences" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "impact_event_entity_services_impact_event_id_idx" ON "impact_event_entity_services" USING btree ("impact_event_id");--> statement-breakpoint
CREATE INDEX "impact_event_entity_services_service_id_idx" ON "impact_event_entity_services" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "impact_event_facility_effects_impact_event_id_idx" ON "impact_event_facility_effects" USING btree ("impact_event_id");--> statement-breakpoint
CREATE INDEX "impact_event_facility_effects_kind_idx" ON "impact_event_facility_effects" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "impact_event_periods_set_periods_impact_event_id_idx" ON "impact_event_periods" USING btree ("impact_event_id","index");--> statement-breakpoint
CREATE INDEX "impact_event_periods_mode_idx" ON "impact_event_periods" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "impact_event_periods_start_at_idx" ON "impact_event_periods" USING btree ("start_ts");--> statement-breakpoint
CREATE INDEX "impact_event_periods_end_at_idx" ON "impact_event_periods" USING btree ("end_ts");--> statement-breakpoint
CREATE INDEX "impact_event_periods_end_at_resolved_idx" ON "impact_event_periods" USING btree ("end_ts_resolved");--> statement-breakpoint
CREATE INDEX "impact_event_periods_end_at_source_idx" ON "impact_event_periods" USING btree ("end_at_source");--> statement-breakpoint
CREATE INDEX "impact_event_periods_end_at_reason_idx" ON "impact_event_periods" USING btree ("end_at_reason");--> statement-breakpoint
CREATE INDEX "impact_event_service_effects_impact_event_id_idx" ON "impact_event_service_effects" USING btree ("impact_event_id");--> statement-breakpoint
CREATE INDEX "impact_event_service_effects_kind_idx" ON "impact_event_service_effects" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "impact_event_service_scopes_impact_event_id_idx" ON "impact_event_service_scopes" USING btree ("impact_event_id");--> statement-breakpoint
CREATE INDEX "impact_event_service_scopes_type_idx" ON "impact_event_service_scopes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "impact_event_service_scopes_station_id_idx" ON "impact_event_service_scopes" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "impact_event_service_scopes_from_station_id_idx" ON "impact_event_service_scopes" USING btree ("from_station_id");--> statement-breakpoint
CREATE INDEX "impact_event_service_scopes_to_station_id_idx" ON "impact_event_service_scopes" USING btree ("to_station_id");--> statement-breakpoint
CREATE INDEX "line_operators_line_id_idx" ON "line_operators" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "line_operators_operator_id_idx" ON "line_operators" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "line_services_line_id_idx" ON "line_services" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "line_services_service_id_idx" ON "line_services" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "service_revision_path_entries_service_revision_id_idx" ON "service_revision_path_station_entries" USING btree ("service_revision_id");--> statement-breakpoint
CREATE INDEX "service_revision_path_entries_service_id_idx" ON "service_revision_path_station_entries" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "service_revision_path_entries_station_id_idx" ON "service_revision_path_station_entries" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "service_revision_path_entries_path_index_idx" ON "service_revision_path_station_entries" USING btree ("path_index");--> statement-breakpoint
CREATE INDEX "service_revisions_service_id_idx" ON "service_revisions" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "services_line_id_idx" ON "services" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "station_codes_line_id_idx" ON "station_codes" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "station_codes_station_id_idx" ON "station_codes" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "station_landmarks_station_id_idx" ON "station_landmarks" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "station_landmarks_landmark_id_idx" ON "station_landmarks" USING btree ("landmark_id");