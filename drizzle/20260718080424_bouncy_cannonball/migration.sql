ALTER TABLE "crowd_reports" ADD COLUMN "producer" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "crowd_reports" ADD COLUMN "external_report_id" text;--> statement-breakpoint
ALTER TABLE "crowd_reports" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "crowd_reports" ADD COLUMN "request_payload_digest" text;--> statement-breakpoint
CREATE UNIQUE INDEX "crowd_reports_producer_external_report_id_uidx" ON "crowd_reports" ("producer","external_report_id");