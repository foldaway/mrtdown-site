import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDb } from '~/db';
import { purgePublicDataCache } from '~/util/cloudflareCache';
import { rebuildOperationalFactsForDates } from '~/util/dbQueries/operationalFacts';
import { publishRangeSnapshot } from '~/util/rangeSnapshot.server';
import { rangeSnapshotStore } from '~/util/rangeSnapshotStore.server';
import {
  publishStationProfileSnapshot,
  stationProfileSnapshotStore,
} from '~/util/stationProfileSnapshot.server';
import {
  acquireOrRenewPullWorkflowLease,
  releasePullWorkflowLease,
} from '../pull/helpers/workflowLease';
import {
  beginPublicHolidaySync,
  canSkipPublicHolidaySync,
} from './helpers/syncCheckpoint';
import {
  fetchDataGovPublicHolidays,
  normalizeDataGovPublicHolidayRecord,
  syncPublicHolidays,
} from './helpers/syncPublicHolidays';
import './index';

const state = vi.hoisted(() => ({
  execute: undefined as
    | undefined
    | ((context: {
        workflowRunId: string;
        run: (name: string, fn: () => unknown) => unknown;
      }) => Promise<void>),
  store: new Map<string, string>(),
  where: vi.fn(async () => {}),
  redisAvailable: true,
  sqlDisabled: false,
}));
vi.mock('@upstash/workflow/tanstack', () => ({
  createWorkflow: (execute: typeof state.execute) => {
    state.execute = execute;
    return {};
  },
}));
vi.mock('~/db/index.js', () => ({
  getDb: vi.fn(() => {
    if (state.sqlDisabled) throw Error('SQL disabled');
    return { delete: () => ({ where: state.where }) };
  }),
}));
vi.mock('../pull/helpers/workflowLease.js', () => ({
  acquireOrRenewPullWorkflowLease: vi.fn(async () => true),
  assertPullWorkflowLease: vi.fn(async () => {}),
  releasePullWorkflowLease: vi.fn(async () => {}),
}));
vi.mock('./helpers/syncPublicHolidays.js', async (original) => ({
  ...(await original<typeof import('./helpers/syncPublicHolidays')>()),
  fetchDataGovPublicHolidays: vi.fn(),
  syncPublicHolidays: vi.fn(),
}));
vi.mock('~/util/pageProfileRedis.server', () => ({
  getPageProfileRedis: async () => {
    if (!state.redisAvailable) throw Error('Redis unavailable');
    return {
      getrange: async (key: string) => state.store.get(key) ?? '',
      set: async (key: string, value: string) => {
        state.store.set(key, value);
        return 'OK';
      },
    };
  },
}));
vi.mock('~/util/dbQueries/operationalFacts.js', () => ({
  rebuildOperationalFactsForDates: vi.fn(async () => []),
}));
vi.mock('~/util/cloudflareCache.js', () => ({
  purgePublicDataCache: vi.fn(async () => {}),
}));
vi.mock('~/util/stationProfileSnapshot.server', async (original) => ({
  ...(await original<typeof import('~/util/stationProfileSnapshot.server')>()),
  publishStationProfileSnapshot: vi.fn(async () => {}),
}));
vi.mock('~/util/rangeSnapshot.server.js', () => ({
  publishRangeSnapshot: vi.fn(async () => undefined),
}));

const rows = [
  normalizeDataGovPublicHolidayRecord({
    date: '2026-12-25',
    holiday: 'Christmas',
  }),
];
const run = () =>
  state.execute?.({
    workflowRunId: 'holiday-run',
    run: async (_name, fn) => fn(),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.store.clear();
  state.redisAvailable = true;
  vi.stubEnv('REDIS_URL', 'redis://unused');
  vi.spyOn(rangeSnapshotStore, 'read').mockResolvedValue({
    inputs: {},
    value: { generation: 'g', fingerprint: 'f' },
  } as never);
  vi.spyOn(stationProfileSnapshotStore, 'read').mockResolvedValue({
    inputs: {},
    value: { generation: 'g', fingerprint: 'f' },
  } as never);
  state.sqlDisabled = false;
  vi.mocked(fetchDataGovPublicHolidays).mockResolvedValue(rows);
  vi.mocked(syncPublicHolidays).mockImplementation(async () => ({
    checkpointToken: await beginPublicHolidaySync(),
    fetched: 1,
    upserted: 1,
    deleted: 0,
    changedDates: ['2026-12-25'],
    range: null,
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('skips a completed unchanged source without database access or SQL lease calls; changed and missing state retain work', async () => {
  await run();
  vi.clearAllMocks();
  state.sqlDisabled = true;
  await run();
  expect(getDb).not.toHaveBeenCalled();
  expect(acquireOrRenewPullWorkflowLease).not.toHaveBeenCalled();
  expect(releasePullWorkflowLease).not.toHaveBeenCalled();
  expect(syncPublicHolidays).not.toHaveBeenCalled();
  state.sqlDisabled = false;
  expect(await canSkipPublicHolidaySync([])).toBe(false);
  vi.mocked(fetchDataGovPublicHolidays).mockResolvedValueOnce([
    { ...rows[0], holidayName: 'Corrected holiday' },
  ]);
  await run();
  expect(syncPublicHolidays).toHaveBeenCalledOnce();
  state.store.clear();
  await run();
  expect(syncPublicHolidays).toHaveBeenCalledTimes(2);
  state.redisAvailable = false;
  expect(await canSkipPublicHolidaySync(rows)).toBe(false);
});

it.each(['facts', 'publication', 'stations', 'purge'] as const)(
  'keeps %s failure retryable and checkpoints only after recovery and pending-date cleanup',
  async (failure) => {
    vi.spyOn(rangeSnapshotStore, 'read').mockResolvedValue({
      inputs: {},
      value: { generation: 'g', fingerprint: 'f' },
    } as never);
    const failed = {
      facts: rebuildOperationalFactsForDates,
      publication: publishRangeSnapshot,
      stations: publishStationProfileSnapshot,
      purge: purgePublicDataCache,
    }[failure];
    vi.mocked(failed).mockRejectedValueOnce(Error('interrupted'));
    await expect(run()).rejects.toThrow('interrupted');
    expect(await canSkipPublicHolidaySync(rows)).toBe(false);
    expect(state.where).not.toHaveBeenCalled();
    expect(releasePullWorkflowLease).toHaveBeenCalled();
    // SQL's pending dates are returned again even after the first sync committed.
    await run();
    expect(rebuildOperationalFactsForDates).toHaveBeenLastCalledWith([
      '2026-12-25',
    ]);
    expect(
      vi.mocked(publishRangeSnapshot).mock.invocationCallOrder.at(-1),
    ).toBeLessThan(
      vi.mocked(purgePublicDataCache).mock.invocationCallOrder.at(-1) ?? 0,
    );
    expect(state.where).toHaveBeenCalledOnce();
    expect(await canSkipPublicHolidaySync(rows)).toBe(true);
    vi.mocked(rangeSnapshotStore.read).mockResolvedValue(null);
    expect(await canSkipPublicHolidaySync(rows)).toBe(false);
  },
);

it('rejects a superseded workflow before it clears pending work or certifies another writer', async () => {
  vi.mocked(syncPublicHolidays).mockImplementationOnce(async () => {
    const checkpointToken = await beginPublicHolidaySync();
    await beginPublicHolidaySync(); // A new writer took over after a lease expired.
    return {
      checkpointToken,
      fetched: 1,
      upserted: 0,
      deleted: 0,
      changedDates: ['2026-12-25'],
      range: null,
    };
  });
  await expect(run()).rejects.toThrow('superseded');
  expect(rebuildOperationalFactsForDates).not.toHaveBeenCalled();
  expect(publishRangeSnapshot).not.toHaveBeenCalled();
  expect(state.where).not.toHaveBeenCalled();
  expect(await canSkipPublicHolidaySync(rows)).toBe(false);
});

it('does not touch SQL after a source failure and retains SQL operation without Redis', async () => {
  vi.mocked(fetchDataGovPublicHolidays).mockRejectedValueOnce(
    Error('source unavailable'),
  );
  await expect(run()).rejects.toThrow('source unavailable');
  expect(getDb).not.toHaveBeenCalled();
  expect(acquireOrRenewPullWorkflowLease).not.toHaveBeenCalled();
  await run();
  vi.stubEnv('REDIS_URL', undefined);
  expect(await canSkipPublicHolidaySync(rows)).toBe(false);
  await run();
  expect(syncPublicHolidays).toHaveBeenCalledTimes(2);
});
