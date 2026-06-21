-- Repairs databases that skipped 0005 because its journal timestamp is older than 0002-0004.
ALTER TABLE "impact_event_periods" DROP CONSTRAINT IF EXISTS "impact_event_periods_impact_event_id_index_mode_pk";--> statement-breakpoint
DROP INDEX IF EXISTS "impact_event_periods_set_periods_impact_event_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "impact_event_periods_mode_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "impact_event_periods_end_at_resolved_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "impact_event_periods_end_at_source_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "impact_event_periods_end_at_reason_idx";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'impact_event_periods'
      AND column_name = 'mode'
  ) THEN
    EXECUTE '
      WITH ranked AS (
        SELECT
          ctid,
          row_number() OVER (
            PARTITION BY "impact_event_id", "index"
            ORDER BY
              CASE WHEN "mode" = ''canonical'' THEN 0 ELSE 1 END,
              "created_at" ASC,
              "updated_at" ASC
          ) AS rn
        FROM "impact_event_periods"
      )
      DELETE FROM "impact_event_periods" p
      USING ranked r
      WHERE p.ctid = r.ctid
        AND r.rn > 1
    ';
  ELSE
    EXECUTE '
      WITH ranked AS (
        SELECT
          ctid,
          row_number() OVER (
            PARTITION BY "impact_event_id", "index"
            ORDER BY "created_at" ASC, "updated_at" ASC
          ) AS rn
        FROM "impact_event_periods"
      )
      DELETE FROM "impact_event_periods" p
      USING ranked r
      WHERE p.ctid = r.ctid
        AND r.rn > 1
    ';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "impact_event_periods" DROP COLUMN IF EXISTS "mode";--> statement-breakpoint
ALTER TABLE "impact_event_periods" DROP COLUMN IF EXISTS "end_ts_resolved";--> statement-breakpoint
ALTER TABLE "impact_event_periods" DROP COLUMN IF EXISTS "end_at_source";--> statement-breakpoint
ALTER TABLE "impact_event_periods" DROP COLUMN IF EXISTS "end_at_reason";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."resolve_periods_end_at_source";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."resolve_periods_end_at_reason";--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"impact_event_periods"'::regclass
      AND conname = 'impact_event_periods_impact_event_id_index_pk'
  ) THEN
    ALTER TABLE "impact_event_periods" ADD CONSTRAINT "impact_event_periods_impact_event_id_index_pk" PRIMARY KEY("impact_event_id","index");
  END IF;
END $$;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."resolve_periods_mode_kind";
