ALTER TABLE "stations_next" ALTER COLUMN "geo" SET DATA TYPE geometry(point,4326) USING "geo"::geometry(point,4326);--> statement-breakpoint
ALTER TABLE "stations" ALTER COLUMN "geo" SET DATA TYPE geometry(point,4326) USING "geo"::geometry(point,4326);--> statement-breakpoint
ALTER TABLE "crowd_reports" DROP CONSTRAINT "crowd_reports_delay_minutes_check", ADD CONSTRAINT "crowd_reports_delay_minutes_check" CHECK ("delay_minutes" is null or ("delay_minutes" >= 0 and "delay_minutes" <= 180));--> statement-breakpoint
ALTER TABLE "impact_event_service_scopes" DROP CONSTRAINT "impact_event_service_scopes_type_station_shape_check", ADD CONSTRAINT "impact_event_service_scopes_type_station_shape_check" CHECK (
          (
            "type" = 'service.whole'
            and "station_id" is null
            and "from_station_id" is null
            and "to_station_id" is null
          )
          or (
            "type" = 'service.point'
            and "station_id" is not null
            and "from_station_id" is null
            and "to_station_id" is null
          )
          or (
            "type" = 'service.segment'
            and "station_id" is null
            and "from_station_id" is not null
            and "to_station_id" is not null
          )
        );