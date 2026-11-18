import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getrange: vi.fn(),
  set: vi.fn(),
  expire: vi.fn(),
  marker: vi.fn(),
  rows: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('./pageProfileRedis.server', () => ({
  getPageProfileRedis: async () => mocks,
}));
vi.mock('./dbQueries/database', () => ({
  getDefaultDb: async () => ({ transaction: mocks.transaction }),
}));
vi.mock('~/db/pageProfileGeneration', () => ({
  readCompletedPageProfileGeneration: mocks.marker,
}));
vi.mock('./dbQueries/servicePaths', () => ({
  readServicePathRows: mocks.rows,
}));

const rows = [
  {
    service_revision_id: 'shared',
    service_id: 'service-a',
    station_id: 'A',
    display_code: 'A1',
    path_index: 0,
  },
  {
    service_revision_id: 'shared',
    service_id: 'service-b',
    station_id: 'B',
    display_code: 'B1',
    path_index: 0,
  },
];
const raw = (generation = 'pull-a') =>
  JSON.stringify({ version: 1, generation, rows });
let cache: typeof import('./servicePathCache.server');
const tx = {};
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('TIER', 'staging');
  cache = await import('./servicePathCache.server');
  mocks.getrange.mockResolvedValue(raw());
  mocks.set.mockResolvedValue('OK');
  mocks.expire.mockResolvedValue(1);
  mocks.transaction.mockImplementation((fn) => fn(tx));
  mocks.marker.mockResolvedValue('pull-a');
  mocks.rows.mockResolvedValue(structuredClone(rows));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('service-path cache', () => {
  it('shares a bounded cold read, isolates callers from mutation, and refreshes the local memo', async () => {
    vi.setSystemTime(new Date('2026-11-18T00:00:00Z'));
    const [a, b] = await Promise.all([
      cache.readCachedServicePaths('pull-a'),
      cache.readCachedServicePaths('pull-a'),
    ]);
    expect(a?.rows).toEqual(rows);
    expect(b?.rows).toEqual(rows);
    expect(mocks.getrange).toHaveBeenCalledExactlyOnceWith(
      cache.getServicePathCacheKey('pull-a'),
      0,
      512 * 1024,
    );
    if (!a || !b) throw Error('Expected hits');
    a.rows[0].station_id = 'mutated';
    expect(b.rows).toEqual(rows);
    expect(await cache.readCachedServicePaths('pull-a')).toMatchObject({
      rows,
      source: 'memory',
      redisBytes: 0,
    });
    vi.setSystemTime(new Date('2026-11-18T00:05:01Z'));
    expect(await cache.readCachedServicePaths('pull-a')).toMatchObject({
      rows,
      source: 'redis',
    });
    expect(mocks.getrange).toHaveBeenCalledTimes(2);
    expect(mocks.rows).not.toHaveBeenCalled();
  });

  it.each([
    '',
    '{bad',
    raw('other-generation'),
    JSON.stringify({
      version: 1,
      generation: 'pull-a',
      rows: [{ ...rows[0], path_index: -1 }],
    }),
    ' '.repeat(512 * 1024 + 1),
  ])(
    'rejects missing, malformed, mismatched, or oversized entries',
    async (value) => {
      mocks.getrange.mockResolvedValue(value);
      expect(await cache.readCachedServicePaths('pull-a')).toBeNull();
      expect(mocks.set).not.toHaveBeenCalled();
    },
  );

  it('falls back on a Redis deadline and retries without retaining the failed load', async () => {
    mocks.getrange.mockRejectedValueOnce(Error('Command timed out'));
    expect(await cache.readCachedServicePaths('pull-a')).toBeNull();
    expect(await cache.readCachedServicePaths('pull-a')).toMatchObject({
      rows,
      source: 'redis',
    });
    expect(await cache.readCachedServicePaths('')).toBeNull();
  });

  it('never reuses an old generation memo after publication or across tiers', async () => {
    await cache.readCachedServicePaths('pull-a');
    mocks.getrange.mockResolvedValue(raw('pull-b'));
    expect(await cache.readCachedServicePaths('pull-b')).toMatchObject({
      rows,
      source: 'redis',
    });
    vi.stubEnv('TIER', 'production');
    expect(await cache.readCachedServicePaths('pull-b')).toMatchObject({
      source: 'redis',
    });
    expect(mocks.getrange).toHaveBeenLastCalledWith(
      'mrtdown:production:service-paths:v1:pull-b',
      0,
      512 * 1024,
    );
  });

  it('bounds concurrent generation loads and leaves an older snapshot isolated during publication', async () => {
    let release: (value: string) => void = () => {};
    mocks.getrange.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const old = cache.readCachedServicePaths('pull-a');
    await vi.waitFor(() => expect(mocks.getrange).toHaveBeenCalledOnce());
    expect(await cache.readCachedServicePaths('pull-b')).toBeNull();
    release(raw());
    expect(await old).toMatchObject({ rows });
    mocks.getrange.mockResolvedValue(raw('pull-b'));
    expect(await cache.readCachedServicePaths('pull-b')).toMatchObject({
      source: 'redis',
    });
  });

  it('publishes only rows read with the completed generation in one snapshot', async () => {
    expect(await cache.publishServicePathCache('pull-a')).toMatchObject({
      published: true,
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
    expect(mocks.marker).toHaveBeenCalledWith(tx);
    expect(mocks.rows).toHaveBeenCalledWith(tx);
    expect(mocks.set).toHaveBeenCalledWith(
      cache.getServicePathCacheKey('pull-a'),
      raw(),
      'EX',
      86400,
      'NX',
    );
    mocks.marker.mockResolvedValue(undefined);
    await expect(cache.publishServicePathCache()).rejects.toThrow(
      'completed matching',
    );
    mocks.marker.mockResolvedValue('pull-b');
    await expect(cache.publishServicePathCache('pull-a')).rejects.toThrow(
      'completed matching',
    );
    expect(mocks.set).toHaveBeenCalledOnce();
  });

  it('renews identical data on retry without replacing immutable generation contents', async () => {
    mocks.set.mockResolvedValue(null);
    await cache.publishServicePathCache('pull-a');
    expect(mocks.expire).toHaveBeenCalledWith(
      cache.getServicePathCacheKey('pull-a'),
      86400,
    );
    mocks.getrange.mockResolvedValue(raw('other'));
    await expect(cache.publishServicePathCache('pull-a')).rejects.toThrow(
      'disagree',
    );
    expect(mocks.expire).toHaveBeenCalledOnce();
  });

  it('skips oversized publication and propagates Redis failure for workflow retry', async () => {
    mocks.rows.mockResolvedValue([
      { ...rows[0], display_code: 'x'.repeat(512 * 1024) },
    ]);
    expect(await cache.publishServicePathCache()).toMatchObject({
      published: false,
    });
    expect(mocks.set).not.toHaveBeenCalled();
    mocks.rows.mockResolvedValue(structuredClone(rows));
    mocks.set.mockRejectedValue(Error('Redis unavailable'));
    await expect(cache.publishServicePathCache()).rejects.toThrow(
      'Redis unavailable',
    );
  });
});
