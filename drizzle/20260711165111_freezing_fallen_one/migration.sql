CREATE TABLE "workflow_leases" (
	"key" text PRIMARY KEY,
	"owner" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
