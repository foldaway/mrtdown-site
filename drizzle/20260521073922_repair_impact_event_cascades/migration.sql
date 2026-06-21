DELETE FROM "impact_event_basis_evidences" AS child
WHERE NOT EXISTS (
  SELECT 1
  FROM "impact_events" AS parent
  WHERE parent."id" = child."impact_event_id"
)
OR NOT EXISTS (
  SELECT 1
  FROM "evidences" AS parent
  WHERE parent."id" = child."evidence_id"
);
--> statement-breakpoint
DELETE FROM "impact_event_causes" AS child
WHERE NOT EXISTS (
  SELECT 1
  FROM "impact_events" AS parent
  WHERE parent."id" = child."impact_event_id"
);
--> statement-breakpoint
DELETE FROM "impact_event_entity_facilities" AS child
WHERE NOT EXISTS (
  SELECT 1
  FROM "impact_events" AS parent
  WHERE parent."id" = child."impact_event_id"
);
--> statement-breakpoint
DELETE FROM "impact_event_entity_services" AS child
WHERE NOT EXISTS (
  SELECT 1
  FROM "impact_events" AS parent
  WHERE parent."id" = child."impact_event_id"
);
--> statement-breakpoint
DELETE FROM "impact_event_facility_effects" AS child
WHERE NOT EXISTS (
  SELECT 1
  FROM "impact_events" AS parent
  WHERE parent."id" = child."impact_event_id"
);
--> statement-breakpoint
DELETE FROM "impact_event_periods" AS child
WHERE NOT EXISTS (
  SELECT 1
  FROM "impact_events" AS parent
  WHERE parent."id" = child."impact_event_id"
);
--> statement-breakpoint
DELETE FROM "impact_event_service_effects" AS child
WHERE NOT EXISTS (
  SELECT 1
  FROM "impact_events" AS parent
  WHERE parent."id" = child."impact_event_id"
);
--> statement-breakpoint
DELETE FROM "impact_event_service_scopes" AS child
WHERE NOT EXISTS (
  SELECT 1
  FROM "impact_events" AS parent
  WHERE parent."id" = child."impact_event_id"
);
--> statement-breakpoint
ALTER TABLE "impact_event_basis_evidences" DROP CONSTRAINT IF EXISTS "impact_event_basis_evidences_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_basis_evidences" DROP CONSTRAINT IF EXISTS "impact_event_basis_evidences_evidence_id_evidences_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_causes" DROP CONSTRAINT IF EXISTS "impact_event_causes_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_entity_facilities" DROP CONSTRAINT IF EXISTS "impact_event_entity_facilities_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_entity_services" DROP CONSTRAINT IF EXISTS "impact_event_entity_services_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_facility_effects" DROP CONSTRAINT IF EXISTS "impact_event_facility_effects_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_periods" DROP CONSTRAINT IF EXISTS "impact_event_periods_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_service_effects" DROP CONSTRAINT IF EXISTS "impact_event_service_effects_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_service_scopes" DROP CONSTRAINT IF EXISTS "impact_event_service_scopes_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_basis_evidences" ADD CONSTRAINT "impact_event_basis_evidences_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE cascade ON UPDATE cascade NOT VALID;
--> statement-breakpoint
ALTER TABLE "impact_event_basis_evidences" ADD CONSTRAINT "impact_event_basis_evidences_evidence_id_evidences_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidences"("id") ON DELETE cascade ON UPDATE cascade NOT VALID;
--> statement-breakpoint
ALTER TABLE "impact_event_causes" ADD CONSTRAINT "impact_event_causes_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE cascade ON UPDATE cascade NOT VALID;
--> statement-breakpoint
ALTER TABLE "impact_event_entity_facilities" ADD CONSTRAINT "impact_event_entity_facilities_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE cascade ON UPDATE cascade NOT VALID;
--> statement-breakpoint
ALTER TABLE "impact_event_entity_services" ADD CONSTRAINT "impact_event_entity_services_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE cascade ON UPDATE cascade NOT VALID;
--> statement-breakpoint
ALTER TABLE "impact_event_facility_effects" ADD CONSTRAINT "impact_event_facility_effects_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE cascade ON UPDATE cascade NOT VALID;
--> statement-breakpoint
ALTER TABLE "impact_event_periods" ADD CONSTRAINT "impact_event_periods_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE cascade ON UPDATE cascade NOT VALID;
--> statement-breakpoint
ALTER TABLE "impact_event_service_effects" ADD CONSTRAINT "impact_event_service_effects_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE cascade ON UPDATE cascade NOT VALID;
--> statement-breakpoint
ALTER TABLE "impact_event_service_scopes" ADD CONSTRAINT "impact_event_service_scopes_impact_event_id_impact_events_id_fk" FOREIGN KEY ("impact_event_id") REFERENCES "public"."impact_events"("id") ON DELETE cascade ON UPDATE cascade NOT VALID;
--> statement-breakpoint
ALTER TABLE "impact_event_basis_evidences" VALIDATE CONSTRAINT "impact_event_basis_evidences_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_basis_evidences" VALIDATE CONSTRAINT "impact_event_basis_evidences_evidence_id_evidences_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_causes" VALIDATE CONSTRAINT "impact_event_causes_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_entity_facilities" VALIDATE CONSTRAINT "impact_event_entity_facilities_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_entity_services" VALIDATE CONSTRAINT "impact_event_entity_services_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_facility_effects" VALIDATE CONSTRAINT "impact_event_facility_effects_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_periods" VALIDATE CONSTRAINT "impact_event_periods_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_service_effects" VALIDATE CONSTRAINT "impact_event_service_effects_impact_event_id_impact_events_id_fk";
--> statement-breakpoint
ALTER TABLE "impact_event_service_scopes" VALIDATE CONSTRAINT "impact_event_service_scopes_impact_event_id_impact_events_id_fk";
