import { DateTime } from 'luxon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getIssueFn } from './issue.functions';
import { getCachedIssueProfile } from './issueProfileCache.server';
import { ISSUE_PROFILE_FRESH_UNTIL_HEADER } from './publicResponseCache';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  issue: vi.fn(),
  assemble: vi.fn(),
  db: vi.fn(),
  header: vi.fn(),
}));
vi.mock('./issueProfileSnapshot.server', () => ({
  issueProfileSnapshotStore: { read: mocks.read },
}));
vi.mock('./dbQueries/issueProfileSnapshotInputs', () => ({
  assembleIssueProfileSnapshot: mocks.assemble,
}));
vi.mock('./dbQueries/issue', () => ({ getIssueReadModel: mocks.issue }));
vi.mock('./dbQueries/database', () => ({ getDefaultDb: mocks.db }));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: () => ({ handler: (handle: unknown) => handle }),
  }),
}));
vi.mock('@tanstack/react-start/server', () => ({
  setResponseHeader: mocks.header,
}));
const now = DateTime.fromISO('2026-11-18T23:50:00', { zone: 'Asia/Singapore' });
const profile = (status: string) => ({
  data: { id: 'issue', updates: [] },
  included: { issues: { issue: { intervals: [{ status }] } } },
});
const call = () => getIssueFn({ data: { issueId: 'issue' } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('REDIS_URL', 'redis://unused');
  vi.setSystemTime(now.toJSDate());
  mocks.read.mockResolvedValue({
    snapshot: { inputs: { topology: {} } },
    part: {},
  });
  mocks.assemble.mockReturnValue(profile('ended'));
  mocks.issue.mockResolvedValue(profile('ended'));
  mocks.db.mockResolvedValue({
    transaction: (callback: (tx: unknown) => unknown) => callback('tx'),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('published Issue Profile handler', () => {
  it('retains completed deadlines and no-store for clock-dependent profiles', async () => {
    await call();
    expect(mocks.header).toHaveBeenCalledWith(
      ISSUE_PROFILE_FRESH_UNTIL_HEADER,
      String(now.plus({ days: 1 }).startOf('day').toMillis()),
    );
    for (const status of ['ongoing', 'future']) {
      mocks.header.mockClear();
      mocks.assemble.mockReturnValue(profile(status));
      await call();
      expect(mocks.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('uses uncached SQL recovery for an unknown or unavailable publication and local development', async () => {
    mocks.read.mockResolvedValue(null);
    await call();
    expect(mocks.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(mocks.issue).toHaveBeenCalledWith('issue', expect.anything(), 'tx');
    vi.stubEnv('REDIS_URL', '');
    mocks.read.mockClear();
    expect((await getCachedIssueProfile('issue', now)).source).toBe('sql');
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('marks SQL errors and missing IDs no-store without caching their absence', async () => {
    mocks.read.mockResolvedValue(null);
    const missing = new Response('Issue not found', { status: 404 });
    mocks.issue.mockRejectedValue(missing);
    await expect(call()).rejects.toBe(missing);
    expect(mocks.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
    mocks.issue.mockResolvedValue(profile('ended'));
    expect(await call()).toEqual(profile('ended'));
    expect(mocks.issue).toHaveBeenCalledTimes(2);
  });
});
