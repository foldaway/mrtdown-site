import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { purgePublicDataCache } from '~/util/cloudflareCache';
import { rebuildOperationalFactsRange } from '~/util/dbQueries/operationalFacts';
import { publishSitemapSnapshot } from '~/util/dbQueries/sitemap';
import {
  publishStatisticsSnapshot,
  rebuildStatisticsSnapshot,
} from '~/util/dbQueries/statistics';
import { rangeSnapshotStore } from '~/util/rangeSnapshotStore.server';
import {
  acquireOrRenewPullWorkflowLease,
  releasePullWorkflowLease,
} from '~/workflows/pull/helpers/workflowLease';
import { handleFactsPost } from './internal.api.tasks.facts';

vi.mock('~/db', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('~/db/pageProfileGeneration', () => ({
  readCompletedPageProfileGeneration: vi.fn(async () => 'completed'),
}));
vi.mock('~/util/cloudflareCache', () => ({
  purgePublicDataCache: vi.fn(async () => {}),
}));
vi.mock('~/util/dbQueries/operationalFacts', () => ({
  rebuildOperationalFactsRange: vi.fn(async () => []),
}));
vi.mock('~/util/dbQueries/statistics', () => ({
  rebuildStatisticsSnapshot: vi.fn(async () => ({})),
  publishStatisticsSnapshot: vi.fn(async () => {}),
}));
vi.mock('~/util/dbQueries/sitemap', () => ({
  rebuildSitemapSnapshot: vi.fn(async () => ({})),
  publishSitemapSnapshot: vi.fn(async () => {}),
}));
vi.mock('~/util/rangeSnapshotStore.server', () => ({
  rangeSnapshotStore: { invalidateCompletion: vi.fn(async () => {}) },
}));
vi.mock('~/workflows/pull/helpers/workflowLease', () => ({
  acquireOrRenewPullWorkflowLease: vi.fn(async () => true),
  assertPullWorkflowLease: vi.fn(async () => {}),
  releasePullWorkflowLease: vi.fn(async () => {}),
}));
const request = () =>
  new Request('https://local/internal/api/tasks/facts', {
    method: 'POST',
    body: JSON.stringify({ days: 1 }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('REDIS_URL', 'redis://unused');
});
afterEach(() => vi.unstubAllEnvs());

it('serializes facts with canonical writers and rejects incomplete generations before mutation', async () => {
  vi.mocked(acquireOrRenewPullWorkflowLease).mockResolvedValueOnce(false);
  expect((await handleFactsPost(request())).status).toBe(409);
  expect(rebuildOperationalFactsRange).not.toHaveBeenCalled();
  vi.mocked(readCompletedPageProfileGeneration).mockResolvedValueOnce(
    undefined,
  );
  await expect(handleFactsPost(request())).rejects.toThrow(
    'completed canonical inputs',
  );
  expect(rangeSnapshotStore.invalidateCompletion).not.toHaveBeenCalled();
  expect(releasePullWorkflowLease).toHaveBeenCalledOnce();
});

it('keeps interrupted publication repairable, releases the lease and publishes a retry before purge', async () => {
  vi.mocked(publishStatisticsSnapshot).mockRejectedValueOnce(
    Error('Redis failed'),
  );
  await expect(handleFactsPost(request())).rejects.toThrow('Redis failed');
  expect(
    vi.mocked(rangeSnapshotStore.invalidateCompletion).mock
      .invocationCallOrder[0],
  ).toBeLessThan(
    vi.mocked(rebuildOperationalFactsRange).mock.invocationCallOrder[0],
  );
  expect(purgePublicDataCache).not.toHaveBeenCalled();
  expect(releasePullWorkflowLease).toHaveBeenCalledOnce();
  expect((await handleFactsPost(request())).status).toBe(200);
  expect(
    vi.mocked(rebuildStatisticsSnapshot).mock.invocationCallOrder.at(-1),
  ).toBeLessThan(
    vi.mocked(publishStatisticsSnapshot).mock.invocationCallOrder.at(-1) ?? 0,
  );
  expect(
    vi.mocked(publishStatisticsSnapshot).mock.invocationCallOrder.at(-1),
  ).toBeLessThan(
    vi.mocked(publishSitemapSnapshot).mock.invocationCallOrder.at(-1) ?? 0,
  );
  expect(
    vi.mocked(publishSitemapSnapshot).mock.invocationCallOrder.at(-1),
  ).toBeLessThan(
    vi.mocked(purgePublicDataCache).mock.invocationCallOrder.at(-1) ?? 0,
  );
  expect(releasePullWorkflowLease).toHaveBeenCalledTimes(2);
});
