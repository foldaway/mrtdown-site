CREATE TABLE "combined_departure_memberships" (
	"projection_id" integer,
	"service_date" date,
	"provider_trip_id" text,
	"stop_sequence" text,
	"service_id" text,
	"revision_id" text,
	"platform_ids" text[] NOT NULL,
	CONSTRAINT "combined_departure_memberships_pkey" PRIMARY KEY("projection_id","service_date","provider_trip_id","stop_sequence","service_id","revision_id"),
	CONSTRAINT "combined_departure_memberships_platforms" CHECK (cardinality("platform_ids") > 0)
);
--> statement-breakpoint
CREATE TABLE "combined_departure_occurrences" (
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
	"destination_station_id" text NOT NULL,
	"platform_semantics" text NOT NULL,
	"arrival_seconds" bigint,
	"departure_seconds" bigint,
	"arrival_instant" timestamp with time zone,
	"departure_instant" timestamp with time zone,
	"pickup_type" integer NOT NULL,
	"drop_off_type" integer NOT NULL,
	"timepoint" integer NOT NULL,
	CONSTRAINT "combined_departure_occurrences_pkey" PRIMARY KEY("projection_id","service_date","provider_trip_id","stop_sequence"),
	CONSTRAINT "combined_departure_occurrences_identity" CHECK ("stop_sequence" ~ '^[0-9]+$' AND "occurrence_index" >= 0
        AND "platform_semantics" IN ('distinct-platform-associations', 'complete-source-alternatives')),
	CONSTRAINT "combined_departure_occurrences_access" CHECK ("pickup_type" IN (0, 2, 3) AND "drop_off_type" BETWEEN 0 AND 3 AND "timepoint" IN (0, 1)),
	CONSTRAINT "combined_departure_occurrences_timing" CHECK (("arrival_seconds" IS NULL) = ("arrival_instant" IS NULL)
        AND ("departure_seconds" IS NULL) = ("departure_instant" IS NULL)
        AND ("arrival_seconds" IS NULL OR "arrival_seconds" BETWEEN 0 AND 9007199254740991)
        AND ("departure_seconds" IS NULL OR "departure_seconds" BETWEEN 0 AND 9007199254740991)
        AND ("arrival_seconds" IS NULL OR "departure_seconds" IS NULL OR "departure_seconds" >= "arrival_seconds")
        AND ("timepoint" = 0 OR ("arrival_seconds" IS NOT NULL AND "departure_seconds" IS NOT NULL)))
);
--> statement-breakpoint
CREATE INDEX "combined_departure_occurrences_window_idx" ON "combined_departure_occurrences" ("projection_id","service_date","station_id","line_id","destination_station_id","departure_instant");--> statement-breakpoint
ALTER TABLE "combined_departure_memberships" ADD CONSTRAINT "combined_departure_memberships_occurrence_fk" FOREIGN KEY ("projection_id","service_date","provider_trip_id","stop_sequence") REFERENCES "combined_departure_occurrences"("projection_id","service_date","provider_trip_id","stop_sequence") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "combined_departure_occurrences" ADD CONSTRAINT "combined_departure_occurrences_day_fk" FOREIGN KEY ("projection_id","service_date") REFERENCES "scheduled_departure_days"("projection_id","service_date") ON DELETE CASCADE;