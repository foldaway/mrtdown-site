import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { purgePublicDataCache } from '~/util/cloudflareCache';
import { publishRangeSnapshot } from '~/util/rangeSnapshot.server';
import { syncPublicHolidaysFromDataGov } from './helpers/syncPublicHolidays';
import './index';

const state = vi.hoisted(() => ({
  execute: undefined as
    | undefined
    | ((context: {
        run: (name: string, fn: () => unknown) => unknown;
      }) => Promise<void>),
}));
vi.mock('@upstash/workflow/tanstack', () => ({
  createWorkflow: (execute: typeof state.execute) => {
    state.execute = execute;
    return {};
  },
}));
vi.mock('~/db/index.js', () => ({ getDb: () => ({}) }));
vi.mock('./helpers/syncPublicHolidays.js', () => ({
  syncPublicHolidaysFromDataGov: vi.fn(),
}));
vi.mock('~/util/dbQueries/operationalFacts.js', () => ({
  rebuildOperationalFactsForDates: async () => [],
}));
vi.mock('~/util/cloudflareCache.js', () => ({
  purgePublicDataCache: vi.fn(async () => {}),
}));
vi.mock('~/util/rangeSnapshot.server.js', () => ({
  publishRangeSnapshot: vi.fn(async () => undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});
const run = () => state.execute?.({ run: async (_name, fn) => fn() });

it('republishes changed holidays before purging and blocks purge when publication fails', async () => {
  vi.mocked(syncPublicHolidaysFromDataGov).mockResolvedValue({
    fetched: 1,
    upserted: 1,
    deleted: 0,
    changedDates: ['2026-12-25'],
    range: { start: '2026-12-25', end: '2026-12-25' },
  });
  vi.mocked(publishRangeSnapshot).mockRejectedValueOnce(
    Error('publication unavailable'),
  );
  await expect(run()).rejects.toThrow('publication unavailable');
  expect(purgePublicDataCache).not.toHaveBeenCalled();
  await run();
  expect(
    vi.mocked(publishRangeSnapshot).mock.invocationCallOrder[1],
  ).toBeLessThan(vi.mocked(purgePublicDataCache).mock.invocationCallOrder[0]);
});

it('does not republish or purge when the independent holiday input is unchanged', async () => {
  vi.mocked(syncPublicHolidaysFromDataGov).mockResolvedValue({
    fetched: 1,
    upserted: 0,
    deleted: 0,
    changedDates: [],
    range: null,
  });
  await run();
  expect(publishRangeSnapshot).not.toHaveBeenCalled();
  expect(purgePublicDataCache).not.toHaveBeenCalled();
});
