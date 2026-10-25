CREATE TABLE "scheduled_departure_days" (
	"projection_id" integer,
	"service_date" date,
	"active_trip_count" integer NOT NULL,
	"unassigned_active_trip_count" integer NOT NULL,
	CONSTRAINT "scheduled_departure_days_pkey" PRIMARY KEY("projection_id","service_date"),
	CONSTRAINT "scheduled_departure_days_counts" CHECK ("active_trip_count" >= 0 AND "unassigned_active_trip_count" BETWEEN 0 AND "active_trip_count")
);
--> statement-breakpoint
CREATE TABLE "scheduled_departure_occurrences" (
	"projection_id" integer,
	"service_date" date,
	"provider_trip_id" text,
	"provider_route_id" text NOT NULL,
	"provider_calendar_id" text NOT NULL,
	"provider_stop_id" text NOT NULL,
	"stop_sequence" text,
	"occurrence_index" integer NOT NULL,
	"station_id" text NOT NULL,
	"line_id" text NOT NULL,
	"service_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"destination_station_id" text NOT NULL,
	"platform_ids" text[] NOT NULL,
	"arrival_seconds" bigint,
	"departure_seconds" bigint,
	"arrival_instant" timestamp with time zone,
	"departure_instant" timestamp with time zone,
	"pickup_type" integer NOT NULL,
	"drop_off_type" integer NOT NULL,
	"timepoint" integer NOT NULL,
	CONSTRAINT "scheduled_departure_occurrences_pkey" PRIMARY KEY("projection_id","service_date","provider_trip_id","stop_sequence"),
	CONSTRAINT "scheduled_departure_occurrences_identity" CHECK ("stop_sequence" ~ '^[0-9]+$' AND "occurrence_index" >= 0 AND cardinality("platform_ids") > 0),
	CONSTRAINT "scheduled_departure_occurrences_access" CHECK ("pickup_type" IN (0, 2, 3) AND "drop_off_type" BETWEEN 0 AND 3 AND "timepoint" IN (0, 1)),
	CONSTRAINT "scheduled_departure_occurrences_timing" CHECK (("arrival_seconds" IS NULL) = ("arrival_instant" IS NULL)
        AND ("departure_seconds" IS NULL) = ("departure_instant" IS NULL)
        AND ("arrival_seconds" IS NULL OR "arrival_seconds" BETWEEN 0 AND 9007199254740991)
        AND ("departure_seconds" IS NULL OR "departure_seconds" BETWEEN 0 AND 9007199254740991)
        AND ("arrival_seconds" IS NULL OR "departure_seconds" IS NULL OR "departure_seconds" >= "arrival_seconds")
        AND ("timepoint" = 0 OR ("arrival_seconds" IS NOT NULL AND "departure_seconds" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "scheduled_departure_projections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scheduled_departure_projections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"manifest_sha256" text NOT NULL,
	"projector_version" integer NOT NULL,
	"topology_sha256" text NOT NULL,
	"topology_projection_version" integer NOT NULL,
	"feed_start_date" date NOT NULL,
	"feed_end_date" date NOT NULL,
	"maximum_departure_seconds" bigint NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "scheduled_departure_projections_manifest_version" UNIQUE("manifest_sha256","projector_version"),
	CONSTRAINT "scheduled_departure_projections_identity" CHECK ("projector_version" > 0 AND "topology_projection_version" > 0 AND "topology_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "scheduled_departure_projections_range" CHECK ("feed_start_date" <= "feed_end_date" AND "maximum_departure_seconds" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "scheduled_departure_scopes" (
	"projection_id" integer,
	"service_date" date,
	"station_id" text,
	"line_id" text,
	"service_id" text,
	"destination_station_id" text,
	"platform_ids" text[] NOT NULL,
	CONSTRAINT "scheduled_departure_scopes_pkey" PRIMARY KEY("projection_id","service_date","station_id","line_id","service_id","destination_station_id"),
	CONSTRAINT "scheduled_departure_scopes_platforms" CHECK (cardinality("platform_ids") > 0)
);
--> statement-breakpoint
CREATE INDEX "scheduled_departure_occurrences_window_idx" ON "scheduled_departure_occurrences" ("projection_id","service_date","station_id","line_id","service_id","destination_station_id","departure_instant");--> statement-breakpoint
ALTER TABLE "scheduled_departure_days" ADD CONSTRAINT "scheduled_departure_days_54RahMEoc3Ba_fkey" FOREIGN KEY ("projection_id") REFERENCES "scheduled_departure_projections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scheduled_departure_occurrences" ADD CONSTRAINT "scheduled_departure_occurrences_scope_fk" FOREIGN KEY ("projection_id","service_date","station_id","line_id","service_id","destination_station_id") REFERENCES "scheduled_departure_scopes"("projection_id","service_date","station_id","line_id","service_id","destination_station_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scheduled_departure_projections" ADD CONSTRAINT "scheduled_departure_projections_11xY9lEIFBjI_fkey" FOREIGN KEY ("manifest_sha256") REFERENCES "scheduled_timetables"("manifest_sha256");--> statement-breakpoint
ALTER TABLE "scheduled_departure_scopes" ADD CONSTRAINT "scheduled_departure_scopes_day_fk" FOREIGN KEY ("projection_id","service_date") REFERENCES "scheduled_departure_days"("projection_id","service_date") ON DELETE CASCADE;