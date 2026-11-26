import { randomUUID } from 'node:crypto';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getDb } from '~/db';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { purgePublicDataCache } from '~/util/cloudflareCache';
import { rebuildOperationalFactsRange } from '~/util/dbQueries/operationalFacts';
import {
  publishSitemapSnapshot,
  rebuildSitemapSnapshot,
} from '~/util/dbQueries/sitemap';
import {
  publishStatisticsSnapshot,
  rebuildStatisticsSnapshot,
} from '~/util/dbQueries/statistics';
import { internalMiddleware } from '~/util/internal.middleware';
import { rangeSnapshotStore } from '~/util/rangeSnapshotStore.server';
import {
  acquireOrRenewPullWorkflowLease,
  assertPullWorkflowLease,
  releasePullWorkflowLease,
} from '~/workflows/pull/helpers/workflowLease';

const RequestSchema = z.object({
  days: z.number().int().min(1).max(366).default(30),
});

export const Route = createFileRoute('/internal/api/tasks/facts')({
  server: {
    middleware: [internalMiddleware],
    handlers: {
      POST: ({ request }) => handleFactsPost(request),
    },
  },
});

export async function handleFactsPost(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON request body' },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: 'Invalid facts rebuild request',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { days } = parsed.data;
  const db = getDb();
  const owner = randomUUID();
  if (!(await acquireOrRenewPullWorkflowLease(db, owner)))
    return Response.json(
      {
        success: false,
        error: 'Another data writer holds the workflow lease',
      },
      { status: 409 },
    );
  try {
    if (
      process.env.REDIS_URL &&
      !(await readCompletedPageProfileGeneration(db))
    )
      throw new Error('Facts rebuild requires completed canonical inputs');
    if (process.env.REDIS_URL) await rangeSnapshotStore.invalidateCompletion();
    const rows = await rebuildOperationalFactsRange(days);
    const statistics = await rebuildStatisticsSnapshot();
    const sitemap = await rebuildSitemapSnapshot();
    if (process.env.REDIS_URL) {
      await assertPullWorkflowLease(db, owner);
      await publishStatisticsSnapshot();
      await publishSitemapSnapshot();
      await purgePublicDataCache();
    }
    return Response.json(
      {
        success: true,
        days,
        rows,
        statistics,
        sitemap,
      },
      { status: 200 },
    );
  } finally {
    await releasePullWorkflowLease(db, owner);
  }
}
