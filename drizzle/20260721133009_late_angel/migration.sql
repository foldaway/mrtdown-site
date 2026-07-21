ALTER TABLE "lines_next" ADD COLUMN "platform_door_count" integer;--> statement-breakpoint
ALTER TABLE "lines_next" ADD COLUMN "train_car_counts" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "lines" ADD COLUMN "platform_door_count" integer;--> statement-breakpoint
ALTER TABLE "lines" ADD COLUMN "train_car_counts" jsonb DEFAULT '[]' NOT NULL;