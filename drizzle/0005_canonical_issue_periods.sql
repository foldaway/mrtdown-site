ALTER TABLE "impact_event_periods" DROP CONSTRAINT "impact_event_periods_impact_event_id_index_mode_pk";--> statement-breakpoint
DROP INDEX "impact_event_periods_mode_idx";--> statement-breakpoint
DROP INDEX "impact_event_periods_end_at_resolved_idx";--> statement-breakpoint
DROP INDEX "impact_event_periods_end_at_source_idx";--> statement-breakpoint
DROP INDEX "impact_event_periods_end_at_reason_idx";--> statement-breakpoint
WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY "impact_event_id", "index"
      ORDER BY
        CASE WHEN "mode" = 'canonical' THEN 0 ELSE 1 END,
        "created_at" ASC,
        "updated_at" ASC
    ) AS rn
  FROM "impact_event_periods"
)
DELETE FROM "impact_event_periods" p
USING ranked r
WHERE p.ctid = r.ctid
  AND r.rn > 1;--> statement-breakpoint
ALTER TABLE "impact_event_periods" DROP COLUMN "mode";--> statement-breakpoint
ALTER TABLE "impact_event_periods" DROP COLUMN "end_ts_resolved";--> statement-breakpoint
ALTER TABLE "impact_event_periods" DROP COLUMN "end_at_source";--> statement-breakpoint
ALTER TABLE "impact_event_periods" DROP COLUMN "end_at_reason";--> statement-breakpoint
ALTER TABLE "impact_event_periods" ADD CONSTRAINT "impact_event_periods_impact_event_id_index_pk" PRIMARY KEY("impact_event_id","index");--> statement-breakpoint
DROP TYPE "public"."resolve_periods_mode_kind";--> statement-breakpoint
