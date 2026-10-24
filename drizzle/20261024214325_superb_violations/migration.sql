CREATE TABLE "scheduled_timetables" (
	"manifest_sha256" text PRIMARY KEY,
	"predecessor_sha256" text CONSTRAINT "scheduled_timetables_predecessor_unique" UNIQUE NULLS NOT DISTINCT,
	"import_record" jsonb NOT NULL,
	"pages_entry" jsonb NOT NULL,
	"manifest_bytes" bytea NOT NULL,
	"timetable_bytes" bytea NOT NULL,
	"notice_bytes" bytea NOT NULL,
	"release_bytes" bytea NOT NULL,
	"mapping_draft_bytes" bytea NOT NULL,
	"mapping_approval_bytes" bytea NOT NULL,
	"release_review_bytes" bytea NOT NULL,
	CONSTRAINT "scheduled_timetables_manifest_digest" CHECK ("manifest_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "scheduled_timetables_receipt_manifest" CHECK (("import_record"->>'manifestSha256') IS NOT DISTINCT FROM "manifest_sha256"),
	CONSTRAINT "scheduled_timetables_receipt_predecessor" CHECK (("import_record"->>'predecessorSha256') IS NOT DISTINCT FROM "predecessor_sha256")
);
--> statement-breakpoint
ALTER TABLE "scheduled_timetables" ADD CONSTRAINT "scheduled_timetables_sR3hQvgZpBSd_fkey" FOREIGN KEY ("predecessor_sha256") REFERENCES "scheduled_timetables"("manifest_sha256");