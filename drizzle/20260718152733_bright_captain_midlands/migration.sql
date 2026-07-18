CREATE TABLE "station_issue_facts" (
	"station_id" text,
	"issue_id" text,
	"issue_type" "issue_type" NOT NULL,
	"latest_activity_at" timestamp with time zone NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_issue_facts_pkey" PRIMARY KEY("station_id","issue_id")
);
--> statement-breakpoint
CREATE INDEX "station_issue_facts_issue_id_idx" ON "station_issue_facts" ("issue_id");--> statement-breakpoint
CREATE INDEX "station_issue_facts_station_type_activity_idx" ON "station_issue_facts" ("station_id","issue_type","latest_activity_at");--> statement-breakpoint
CREATE INDEX "station_issue_facts_as_of_idx" ON "station_issue_facts" ("as_of");--> statement-breakpoint
ALTER TABLE "station_issue_facts" ADD CONSTRAINT "station_issue_facts_station_id_stations_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "station_issue_facts" ADD CONSTRAINT "station_issue_facts_issue_id_issues_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;