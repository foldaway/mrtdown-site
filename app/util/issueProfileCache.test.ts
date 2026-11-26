import { DateTime } from 'luxon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getIssueFn } from './issue.functions';
import {
  getCachedIssueProfile,
  revalidateIssueProfileResponse,
} from './issueProfileCache.server';
import {
  applyPublicDataCacheHeaders,
  ISSUE_PROFILE_FRESH_UNTIL_HEADER,
  ISSUE_PROFILE_PUBLICATION_HEADER,
} from './publicResponseCache';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  head: vi.fn(),
  issue: vi.fn(),
  assemble: vi.fn(),
  db: vi.fn(),
  header: vi.fn(),
}));
vi.mock('./issueProfileSnapshot.server', () => ({
  issueProfileSnapshotStore: {
    read: mocks.read,
    manifest: { head: mocks.head },
  },
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
function renderedResponse() {
  const headers = new Headers({ 'Content-Type': 'text/html' });
  for (const [key, value] of mocks.header.mock.calls) headers.set(key, value);
  return new Response('Previous evidence', { headers });
}
const finalize = async (response: Response) =>
  applyPublicDataCacheHeaders(
    new Request('https://example.com/issues/issue'),
    await revalidateIssueProfileResponse(response),
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('REDIS_URL', 'redis://unused');
  vi.setSystemTime(now.toJSDate());
  mocks.read.mockResolvedValue({
    snapshot: { inputs: { topology: {} }, value: { publicationId: 'first' } },
    part: {},
  });
  mocks.head.mockResolvedValue({ value: { publicationId: 'first' } });
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
    const completed = await finalize(renderedResponse());
    expect(completed.headers.get('Cloudflare-CDN-Cache-Control')).toBe(
      'public, max-age=600, must-revalidate, stale-if-error=0',
    );
    expect(completed.headers.has(ISSUE_PROFILE_PUBLICATION_HEADER)).toBe(false);
    for (const status of ['ongoing', 'future']) {
      mocks.header.mockClear();
      mocks.assemble.mockReturnValue(profile(status));
      await call();
      expect(mocks.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each(['superseded', 'missing', 'unavailable'])(
    'withholds edge caching when publication is %s after rendering',
    async (state) => {
      await call();
      const rendered = renderedResponse();
      if (state === 'unavailable')
        mocks.head.mockRejectedValue(Error('Redis unavailable'));
      else
        mocks.head.mockResolvedValue({
          value: state === 'missing' ? undefined : { publicationId: 'next' },
        });
      const response = await finalize(rendered);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false);
      expect(response.headers.has(ISSUE_PROFILE_PUBLICATION_HEADER)).toBe(
        false,
      );
      expect(response.headers.has(ISSUE_PROFILE_FRESH_UNTIL_HEADER)).toBe(
        false,
      );
      expect(await response.text()).toBe('Previous evidence');
      expect(mocks.db).not.toHaveBeenCalled();
    },
  );
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
