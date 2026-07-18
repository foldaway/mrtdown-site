CREATE TABLE "sitemap_snapshots" (
	"id" text PRIMARY KEY,
	"as_of" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sitemap_snapshots_as_of_idx" ON "sitemap_snapshots" ("as_of" DESC NULLS LAST);