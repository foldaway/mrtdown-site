import { DateTime } from 'luxon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SG_TIMEZONE } from './dbQueries/dateTime';
import { getCachedIssueProfile } from './issueProfileCache.server';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  marker: vi.fn(),
  issue: vi.fn(),
  navigation: vi.fn(),
  get: vi.fn(),
  eval: vi.fn(),
}));

vi.mock('~/db/pageProfileGeneration', () => ({
  readCompletedPageProfileGeneration: mocks.marker,
}));

vi.mock('./dbQueries/database', () => ({
  getDefaultDb: async () => ({ transaction: mocks.transaction }),
}));

vi.mock('./dbQueries/issue', () => ({ getIssueReadModel: mocks.issue }));

vi.mock('./navigationCache.server', () => ({
  readNavigationCacheEntry: mocks.navigation,
}));

vi.mock('./pageProfileRedis.server', () => ({
  getNavigationCacheKey: () => 'navigation',
  getPageProfileRedis: async () => ({ get: mocks.get, eval: mocks.eval }),
}));

const now = DateTime.fromISO('2026-11-16T23:50:00', { zone: SG_TIMEZONE });
const midnight = now.plus({ days: 1 }).startOf('day');
const key = '{navigation}:issue:pull-1:2026-11-16:2026-11-16-incident';
const tx = {};
const profile = {
  data: {
    id: '2026-11-16-incident',
    updates: [
      {
        type: 'report.public',
        text: '',
        textTranslations: null,
        isTextRedacted: true,
        sourceUrl: 'https://example.com/report',
        createdAt: '2026-11-16 10:30:00+08',
      },
    ],
  },
  included: {
    issues: {
      '2026-11-16-incident': {
        id: '2026-11-16-incident',
        type: 'disruption',
        title: { 'en-SG': 'Incident', 'zh-Hans': null, ms: null, ta: null },
        branchesAffected: [],
        lineIds: [],
        subtypes: [],
        durationSeconds: 1800,
        intervals: [
          {
            startAt: '2026-11-16T10:00:00.000+08:00',
            endAt: '2026-11-16T10:30:00.000+08:00',
            status: 'ended',
          },
        ],
      },
    },
    lines: {},
    stations: {},
    towns: {},
    landmarks: {},
    operators: {},
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.setSystemTime(now.toJSDate());
  mocks.transaction.mockImplementation((callback) => callback(tx));
  mocks.marker.mockResolvedValue('pull-1');
  mocks.issue.mockResolvedValue(profile);
  mocks.navigation.mockResolvedValue({ generation: 'pull-1' });
  mocks.get.mockResolvedValue(null);
  mocks.eval.mockResolvedValue(1);
});

afterEach(() => vi.useRealTimers());

describe('Issue Profile cache', () => {
  it('uses Redis alone on a hit and switches keys at Singapore midnight', async () => {
    mocks.get.mockResolvedValueOnce(JSON.stringify(profile));

    expect(await getCachedIssueProfile('2026-11-16-incident', now)).toEqual({
      profile,
      expiresAt: midnight.toMillis(),
    });
    expect(mocks.get).toHaveBeenCalledWith(key);
    expect(mocks.transaction).not.toHaveBeenCalled();

    vi.setSystemTime(midnight.toJSDate());
    expect(
      await getCachedIssueProfile('2026-11-16-incident', midnight),
    ).toEqual({
      profile,
    });
    expect(mocks.get).toHaveBeenLastCalledWith(
      '{navigation}:issue:pull-1:2026-11-17:2026-11-16-incident',
    );
  });

  it('shares a cold fill and reads the marker and public data in the same snapshot', async () => {
    await expect(
      Promise.all([
        getCachedIssueProfile('2026-11-16-incident', now),
        getCachedIssueProfile('2026-11-16-incident', now),
      ]),
    ).resolves.toEqual([{ profile }, { profile }]);

    expect(mocks.transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    expect(mocks.marker).toHaveBeenCalledExactlyOnceWith(tx);
    expect(mocks.issue).toHaveBeenCalledExactlyOnceWith(
      '2026-11-16-incident',
      now,
      tx,
    );
    expect(mocks.eval).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      2,
      'navigation',
      key,
      'pull-1',
      expect.any(String),
      midnight.toMillis(),
    );
    expect(JSON.parse(mocks.eval.mock.calls[0][5])).toEqual(profile);
  });

  it.each([undefined, 'pull-2'])(
    'keeps a miss uncached when SQL reports generation %s',
    async (generation) => {
      mocks.marker.mockResolvedValue(generation);
      expect(await getCachedIssueProfile('2026-11-16-incident', now)).toEqual({
        profile,
      });
      expect(mocks.eval).not.toHaveBeenCalled();
    },
  );

  it.each(['ongoing', 'future', 'empty'])(
    'keeps a profile with %s intervals on SQL',
    async (status) => {
      const live = structuredClone(profile);
      const issue = live.included.issues['2026-11-16-incident'];
      issue.intervals =
        status === 'empty' ? [] : [{ ...issue.intervals[0], status }];
      mocks.issue.mockResolvedValue(live);

      expect(await getCachedIssueProfile('2026-11-16-incident', now)).toEqual({
        profile: live,
      });
      expect(mocks.eval).not.toHaveBeenCalled();
    },
  );

  it('rejects oversized profiles and rewrites invalid entries from SQL', async () => {
    mocks.get.mockResolvedValue('invalid JSON');
    expect(await getCachedIssueProfile('2026-11-16-incident', now)).toEqual({
      profile,
    });
    expect(mocks.eval).toHaveBeenCalledOnce();

    const large = structuredClone(profile);
    large.data.updates[0].text = 'a'.repeat(128 * 1024);
    mocks.issue.mockResolvedValue(large);
    expect(await getCachedIssueProfile('2026-11-16-incident', now)).toEqual({
      profile: large,
    });
    expect(mocks.eval).toHaveBeenCalledOnce();
  });

  it('preserves SQL 404s and skips writes when Redis times out', async () => {
    mocks.get.mockRejectedValue(new Error('Command timed out'));
    expect(await getCachedIssueProfile('2026-11-16-incident', now)).toEqual({
      profile,
    });
    expect(mocks.eval).not.toHaveBeenCalled();

    const missing = new Response('Issue not found', { status: 404 });
    mocks.issue.mockRejectedValue(missing);
    await expect(getCachedIssueProfile('missing', now)).rejects.toBe(missing);
  });
});
