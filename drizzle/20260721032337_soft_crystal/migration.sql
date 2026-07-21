CREATE TYPE "station_platform_boarding_status" AS ENUM('alighting_only', 'not_in_service');--> statement-breakpoint
CREATE TABLE "station_platform_services" (
	"station_id" text,
	"platform_id" text,
	"service_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_platform_services_pkey" PRIMARY KEY("station_id","platform_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "station_platforms" (
	"station_id" text,
	"platform_id" text,
	"label" text NOT NULL,
	"last_updated" date NOT NULL,
	"line_id" text NOT NULL,
	"boarding_status" "station_platform_boarding_status",
	"inference" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_platforms_pkey" PRIMARY KEY("station_id","platform_id")
);
--> statement-breakpoint
ALTER TABLE "stations_next" ADD COLUMN "layout_platforms" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "stations_next" ALTER COLUMN "layout_platforms" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "station_platform_services_service_id_idx" ON "station_platform_services" ("service_id");--> statement-breakpoint
CREATE INDEX "station_platforms_line_id_idx" ON "station_platforms" ("line_id");--> statement-breakpoint
ALTER TABLE "station_platform_services" ADD CONSTRAINT "station_platform_services_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_platform_services" ADD CONSTRAINT "station_platform_services_platform_fk" FOREIGN KEY ("station_id","platform_id") REFERENCES "station_platforms"("station_id","platform_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_platforms" ADD CONSTRAINT "station_platforms_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_platforms" ADD CONSTRAINT "station_platforms_line_id_lines_id_fkey" FOREIGN KEY ("line_id") REFERENCES "lines"("id");
