CREATE TABLE "station_exits" (
	"station_id" text,
	"source_id" text,
	"source_object_id" integer,
	"source_checksum" text NOT NULL,
	"label" text NOT NULL,
	"last_updated" date NOT NULL,
	"geo" geometry(point,4326) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_exits_pkey" PRIMARY KEY("station_id","source_id","source_object_id")
);
--> statement-breakpoint
ALTER TABLE "stations_next" ADD COLUMN "layout_exit_source_id" text;--> statement-breakpoint
ALTER TABLE "stations_next" ADD COLUMN "layout_exits" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX "station_exits_geo_idx" ON "station_exits" USING gist ("geo");--> statement-breakpoint
ALTER TABLE "station_exits" ADD CONSTRAINT "station_exits_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE;