ALTER TABLE "lines_next" ALTER COLUMN "started_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lines_next" ALTER COLUMN "operating_hours" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lines" ALTER COLUMN "started_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lines" ALTER COLUMN "operating_hours" DROP NOT NULL;