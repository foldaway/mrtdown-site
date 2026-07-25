CREATE TYPE "crowd_arrival_report_status" AS ENUM('accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "crowd_arrival_reports" (
	"id" text PRIMARY KEY,
	"station_id" text NOT NULL,
	"service_id" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"minutes_to_arrival" integer NOT NULL,
	"status" "crowd_arrival_report_status" DEFAULT 'accepted'::"crowd_arrival_report_status" NOT NULL,
	"reporter_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crowd_arrival_reports_minutes_to_arrival_check" CHECK ("minutes_to_arrival" >= 0 and "minutes_to_arrival" <= 30)
);
--> statement-breakpoint
CREATE INDEX "crowd_arrival_reports_station_service_reported_at_idx" ON "crowd_arrival_reports" ("station_id","service_id","reported_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "crowd_arrival_reports_reporter_created_at_idx" ON "crowd_arrival_reports" ("reporter_hash","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "crowd_arrival_reports" ADD CONSTRAINT "crowd_arrival_reports_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id");--> statement-breakpoint
ALTER TABLE "crowd_arrival_reports" ADD CONSTRAINT "crowd_arrival_reports_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id");