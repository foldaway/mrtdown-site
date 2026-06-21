CREATE TABLE "statistics_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "statistics_snapshots_as_of_idx" ON "statistics_snapshots" USING btree ("as_of" DESC NULLS LAST);