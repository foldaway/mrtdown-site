import { setResponseHeader } from '@tanstack/react-start/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRootData } from './dbQueries/root';
import { getLocaleMessages } from './localeMessages';
import { readCachedNavigation } from './navigationCache.server';
import { getRootFn } from './root.functions';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validate: (input: unknown) => unknown) => ({
      handler:
        (handler: (input: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          handler({ data: validate(data) }),
    }),
  }),
}));

vi.mock('@tanstack/react-start/server', () => ({
  getResponseHeader: vi.fn(),
  setResponseHeader: vi.fn(),
}));

vi.mock('./dbQueries/root', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dbQueries/root')>()),
  getRootData: vi.fn(),
}));
vi.mock('./localeMessages', () => ({ getLocaleMessages: vi.fn() }));
vi.mock('./navigationCache.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./navigationCache.server')>()),
  readCachedNavigation: vi.fn(),
}));

const navigation = {
  lineNavItems: [],
  operatorNavItems: [],
  metadata: [
    {
      key: 'manifest_last_pulled_at' as const,
      value: '2026-11-15T00:00:00.000Z',
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TIER', 'staging');
  vi.stubEnv('REDIS_NAVIGATION_CACHE', 'enabled');
  vi.mocked(getRootData).mockResolvedValue(navigation);
  vi.mocked(getLocaleMessages).mockResolvedValue({ test: 'Mesej' });
});

afterEach(() => vi.unstubAllEnvs());

describe('Navigation loader', () => {
  it('serves cached navigation without SQL and loads the requested locale', async () => {
    vi.mocked(readCachedNavigation).mockResolvedValue(navigation);

    expect(await getRootFn({ data: { lang: 'ms' } })).toEqual({
      ...navigation,
      messages: { test: 'Mesej' },
    });
    expect(getRootData).not.toHaveBeenCalled();
    expect(getLocaleMessages).toHaveBeenCalledWith('ms');
    expect(setResponseHeader).toHaveBeenCalledWith(
      'X-MRTDown-Navigation-Source',
      'redis',
    );
  });

  it.each(['miss', 'failure'])(
    'serves SQL fallback on Redis %s without caching the response',
    async (reason) => {
      if (reason === 'miss')
        vi.mocked(readCachedNavigation).mockResolvedValue(null);
      else
        vi.mocked(readCachedNavigation).mockRejectedValue(
          new Error('Redis unavailable'),
        );

      expect(await getRootFn({ data: {} })).toEqual({
        ...navigation,
        messages: { test: 'Mesej' },
      });
      expect(getRootData).toHaveBeenCalledOnce();
      expect(setResponseHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store',
      );
    },
  );

  it('uses SQL directly when staging is only publishing the cache', async () => {
    vi.stubEnv('REDIS_NAVIGATION_CACHE', 'publish');
    await getRootFn({ data: {} });
    expect(readCachedNavigation).not.toHaveBeenCalled();
    expect(getRootData).toHaveBeenCalledOnce();
    expect(setResponseHeader).not.toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
  });
});
