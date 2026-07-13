CREATE TABLE "line_day_issue_intervals" (
	"date" date,
	"line_id" text,
	"issue_id" text,
	"interval_index" integer,
	"issue_type" "issue_type" NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_day_issue_intervals_pkey" PRIMARY KEY("date","line_id","issue_id","interval_index")
);
--> statement-breakpoint
CREATE INDEX "line_day_issue_intervals_line_id_date_idx" ON "line_day_issue_intervals" ("line_id","date");--> statement-breakpoint
CREATE INDEX "line_day_issue_intervals_issue_id_idx" ON "line_day_issue_intervals" ("issue_id");--> statement-breakpoint
CREATE INDEX "line_day_issue_intervals_date_issue_type_idx" ON "line_day_issue_intervals" ("date","issue_type");--> statement-breakpoint
CREATE INDEX "line_day_issue_intervals_as_of_idx" ON "line_day_issue_intervals" ("as_of");--> statement-breakpoint
ALTER TABLE "line_day_issue_intervals" ADD CONSTRAINT "line_day_issue_intervals_issue_id_issues_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "line_day_issue_intervals" ADD CONSTRAINT "line_day_issue_intervals_line_day_fact_fk" FOREIGN KEY ("date","line_id") REFERENCES "line_day_facts"("date","line_id") ON DELETE CASCADE ON UPDATE CASCADE;