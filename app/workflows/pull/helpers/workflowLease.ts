import { and, eq, sql } from 'drizzle-orm';
import type { getDb } from '~/db';
import { workflowLeasesTable } from '~/db/schema';

type AppDb = ReturnType<typeof getDb>;

const PULL_WORKFLOW_LEASE_KEY = 'canonical-data-pull';
const DEFAULT_LEASE_SECONDS = 2 * 60 * 60;

function getLeaseSeconds() {
  const parsed = Number(
    process.env.PULL_WORKFLOW_LEASE_SECONDS ?? DEFAULT_LEASE_SECONDS,
  );
  return Number.isInteger(parsed) && parsed >= 60
    ? parsed
    : DEFAULT_LEASE_SECONDS;
}

export async function acquireOrRenewPullWorkflowLease(
  db: AppDb,
  owner: string,
) {
  const leaseSeconds = getLeaseSeconds();
  const expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  const leases = await db
    .insert(workflowLeasesTable)
    .values({
      key: PULL_WORKFLOW_LEASE_KEY,
      owner,
      expires_at: expiresAt,
    })
    .onConflictDoUpdate({
      target: workflowLeasesTable.key,
      set: {
        owner,
        expires_at: expiresAt,
      },
      setWhere: sql`${workflowLeasesTable.owner} = ${owner} OR ${workflowLeasesTable.expires_at} <= now()`,
    })
    .returning({ owner: workflowLeasesTable.owner });

  return leases[0]?.owner === owner;
}

export async function releasePullWorkflowLease(db: AppDb, owner: string) {
  await db
    .delete(workflowLeasesTable)
    .where(
      and(
        eq(workflowLeasesTable.key, PULL_WORKFLOW_LEASE_KEY),
        eq(workflowLeasesTable.owner, owner),
      ),
    );
}
