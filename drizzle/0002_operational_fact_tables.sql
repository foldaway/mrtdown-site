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

CREATE TABLE "issue_day_facts" (
	"date" date NOT NULL,
	"issue_id" text NOT NULL,
	"issue_type" "issue_type" NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"active_anytime" boolean NOT NULL,
	"active_end_of_day" boolean NOT NULL,
	"duration_seconds" integer NOT NULL,
	"inferred_interval_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_day_facts_date_issue_id_pk" PRIMARY KEY("date","issue_id")
);
--> statement-breakpoint
CREATE TABLE "line_day_facts" (
	"date" date NOT NULL,
	"line_id" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"service_seconds" integer NOT NULL,
	"downtime_disruption_seconds" integer NOT NULL,
	"downtime_maintenance_seconds" integer NOT NULL,
	"downtime_infra_seconds" integer NOT NULL,
	"issue_count_disruption" integer NOT NULL,
	"issue_count_maintenance" integer NOT NULL,
	"issue_count_infra" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_day_facts_date_line_id_pk" PRIMARY KEY("date","line_id")
);
--> statement-breakpoint

ALTER TABLE "issue_day_facts" ADD CONSTRAINT "issue_day_facts_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_day_facts" ADD CONSTRAINT "line_day_facts_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "issue_day_facts_issue_id_idx" ON "issue_day_facts" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_day_facts_date_issue_type_idx" ON "issue_day_facts" USING btree ("date","issue_type");--> statement-breakpoint
CREATE INDEX "issue_day_facts_as_of_idx" ON "issue_day_facts" USING btree ("as_of");--> statement-breakpoint
CREATE INDEX "line_day_facts_line_id_idx" ON "line_day_facts" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "line_day_facts_date_idx" ON "line_day_facts" USING btree ("date");--> statement-breakpoint
CREATE INDEX "line_day_facts_as_of_idx" ON "line_day_facts" USING btree ("as_of");--> statement-breakpoint
