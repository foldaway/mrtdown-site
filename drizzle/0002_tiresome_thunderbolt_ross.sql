ALTER TABLE "evidences" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."evidence_type";--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('statement.official', 'report.public', 'report.media');--> statement-breakpoint
ALTER TABLE "evidences" ALTER COLUMN "type" SET DATA TYPE "public"."evidence_type" USING CASE "type"
	WHEN 'official-statement' THEN 'statement.official'
	WHEN 'public.report' THEN 'report.public'
	WHEN 'media.report' THEN 'report.media'
	ELSE "type"
END::"public"."evidence_type";--> statement-breakpoint
ALTER TABLE "impact_event_facility_effects" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."facility_effect_kind";--> statement-breakpoint
CREATE TYPE "public"."facility_effect_kind" AS ENUM('out-of-service', 'degraded');--> statement-breakpoint
ALTER TABLE "impact_event_facility_effects" ALTER COLUMN "kind" SET DATA TYPE "public"."facility_effect_kind" USING CASE "kind"
	WHEN 'facility-out-of-service' THEN 'out-of-service'
	WHEN 'facility-degraded' THEN 'degraded'
	ELSE "kind"
END::"public"."facility_effect_kind";
