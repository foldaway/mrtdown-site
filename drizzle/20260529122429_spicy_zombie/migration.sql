ALTER TABLE "service_revisions" ADD COLUMN "start_at" date;
--> statement-breakpoint
UPDATE "service_revisions" AS "sr"
SET "start_at" = ("revision"."value"->>'startAt')::date
FROM "services_next" AS "sn",
  LATERAL jsonb_array_elements("sn"."revisions") AS "revision"("value")
WHERE "sr"."service_id" = "sn"."id"
  AND "sr"."id" = "revision"."value"->>'id'
  AND "sr"."start_at" IS NULL;
