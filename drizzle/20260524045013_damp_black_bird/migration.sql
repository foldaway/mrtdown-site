CREATE TYPE "public"."crowd_report_cluster_status" AS ENUM('pending', 'accepted', 'rejected', 'dispatched');--> statement-breakpoint
CREATE TYPE "public"."crowd_report_effect" AS ENUM('delay', 'no-service', 'crowding', 'skipped-stop', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."crowd_report_status" AS ENUM('pending', 'accepted', 'rejected', 'duplicate', 'dispatched');--> statement-breakpoint
CREATE TABLE "crowd_report_abuse_events" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text,
	"ip_hash" text NOT NULL,
	"user_agent_hash" text,
	"client_fingerprint_hash" text,
	"turnstile_token_hash" text,
	"turnstile_outcome" text NOT NULL,
	"rate_limit_bucket_start_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crowd_report_cluster_lines" (
	"cluster_id" text NOT NULL,
	"line_id" text NOT NULL,
	CONSTRAINT "crowd_report_cluster_lines_cluster_id_line_id_pk" PRIMARY KEY("cluster_id","line_id")
);
--> statement-breakpoint
CREATE TABLE "crowd_report_cluster_stations" (
	"cluster_id" text NOT NULL,
	"station_id" text NOT NULL,
	CONSTRAINT "crowd_report_cluster_stations_cluster_id_station_id_pk" PRIMARY KEY("cluster_id","station_id")
);
--> statement-breakpoint
CREATE TABLE "crowd_report_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"effect" "crowd_report_effect",
	"window_start_at" timestamp with time zone NOT NULL,
	"window_end_at" timestamp with time zone NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"status" "crowd_report_cluster_status" DEFAULT 'pending' NOT NULL,
	"dispatched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crowd_report_lines" (
	"report_id" text NOT NULL,
	"line_id" text NOT NULL,
	CONSTRAINT "crowd_report_lines_report_id_line_id_pk" PRIMARY KEY("report_id","line_id")
);
--> statement-breakpoint
CREATE TABLE "crowd_report_moderation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crowd_report_rate_limits" (
	"ip_hash" text NOT NULL,
	"bucket_start_at" timestamp with time zone NOT NULL,
	"submission_count" integer DEFAULT 0 NOT NULL,
	"client_fingerprint_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crowd_report_rate_limits_ip_hash_bucket_start_at_pk" PRIMARY KEY("ip_hash","bucket_start_at")
);
--> statement-breakpoint
CREATE TABLE "crowd_report_stations" (
	"report_id" text NOT NULL,
	"station_id" text NOT NULL,
	CONSTRAINT "crowd_report_stations_report_id_station_id_pk" PRIMARY KEY("report_id","station_id")
);
--> statement-breakpoint
CREATE TABLE "crowd_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"direction_text" text,
	"effect" "crowd_report_effect",
	"delay_minutes" integer,
	"still_happening" boolean,
	"text" text NOT NULL,
	"status" "crowd_report_status" DEFAULT 'pending' NOT NULL,
	"cluster_id" text,
	"duplicate_of_id" text,
	"dispatched_at" timestamp with time zone,
	"dispatch_payload" jsonb,
	"dispatch_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crowd_reports_delay_minutes_check" CHECK ("crowd_reports"."delay_minutes" is null or ("crowd_reports"."delay_minutes" >= 0 and "crowd_reports"."delay_minutes" <= 180))
);
--> statement-breakpoint
ALTER TABLE "crowd_report_abuse_events" ADD CONSTRAINT "crowd_report_abuse_events_report_id_crowd_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."crowd_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_report_cluster_lines" ADD CONSTRAINT "crowd_report_cluster_lines_cluster_id_crowd_report_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."crowd_report_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_report_cluster_lines" ADD CONSTRAINT "crowd_report_cluster_lines_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_report_cluster_stations" ADD CONSTRAINT "crowd_report_cluster_stations_cluster_id_crowd_report_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."crowd_report_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_report_cluster_stations" ADD CONSTRAINT "crowd_report_cluster_stations_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_report_lines" ADD CONSTRAINT "crowd_report_lines_report_id_crowd_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."crowd_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_report_lines" ADD CONSTRAINT "crowd_report_lines_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_report_moderation_events" ADD CONSTRAINT "crowd_report_moderation_events_report_id_crowd_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."crowd_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_report_stations" ADD CONSTRAINT "crowd_report_stations_report_id_crowd_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."crowd_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_report_stations" ADD CONSTRAINT "crowd_report_stations_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_reports" ADD CONSTRAINT "crowd_reports_cluster_id_crowd_report_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."crowd_report_clusters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crowd_report_abuse_events_report_id_idx" ON "crowd_report_abuse_events" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "crowd_report_abuse_events_ip_hash_created_at_idx" ON "crowd_report_abuse_events" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "crowd_report_cluster_lines_line_id_idx" ON "crowd_report_cluster_lines" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "crowd_report_cluster_stations_station_id_idx" ON "crowd_report_cluster_stations" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "crowd_report_clusters_status_idx" ON "crowd_report_clusters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crowd_report_clusters_window_start_at_idx" ON "crowd_report_clusters" USING btree ("window_start_at");--> statement-breakpoint
CREATE INDEX "crowd_report_lines_line_id_idx" ON "crowd_report_lines" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "crowd_report_moderation_events_report_id_idx" ON "crowd_report_moderation_events" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "crowd_report_moderation_events_created_at_idx" ON "crowd_report_moderation_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "crowd_report_rate_limits_bucket_start_at_idx" ON "crowd_report_rate_limits" USING btree ("bucket_start_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "crowd_report_stations_station_id_idx" ON "crowd_report_stations" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "crowd_reports_observed_at_idx" ON "crowd_reports" USING btree ("observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "crowd_reports_status_idx" ON "crowd_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crowd_reports_cluster_id_idx" ON "crowd_reports" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "crowd_reports_duplicate_of_id_idx" ON "crowd_reports" USING btree ("duplicate_of_id");