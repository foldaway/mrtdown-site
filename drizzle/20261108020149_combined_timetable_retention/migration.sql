ALTER TABLE "scheduled_timetables" ADD COLUMN "combined_release" jsonb;--> statement-breakpoint
ALTER TABLE "scheduled_timetables" ALTER COLUMN "pages_entry" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_timetables" ALTER COLUMN "notice_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_timetables" ALTER COLUMN "mapping_draft_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_timetables" ALTER COLUMN "mapping_approval_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_timetables" ALTER COLUMN "release_review_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_timetables" ADD CONSTRAINT "scheduled_timetables_bundle_format" CHECK ((
        "combined_release" IS NULL
        AND "pages_entry" IS NOT NULL
        AND "notice_bytes" IS NOT NULL
        AND "mapping_draft_bytes" IS NOT NULL
        AND "mapping_approval_bytes" IS NOT NULL
        AND "release_review_bytes" IS NOT NULL
      ) OR (
        "combined_release" IS NOT NULL
        AND "pages_entry" IS NULL
        AND "notice_bytes" IS NULL
        AND "mapping_draft_bytes" IS NULL
        AND "mapping_approval_bytes" IS NULL
        AND "release_review_bytes" IS NULL
      ));