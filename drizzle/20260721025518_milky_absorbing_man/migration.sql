ALTER TABLE "service_revisions" ADD COLUMN "estimated_frequency" jsonb;--> statement-breakpoint
ALTER TABLE "stations_next" ADD COLUMN "first_last_train" jsonb;--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "first_last_train" jsonb;