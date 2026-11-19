import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RangeReferenceRows } from './dbQueries/rangeReferences';

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
vi.mock('./dbQueries/rangeReferences', async (original) => ({
  ...(await original<typeof import('./dbQueries/rangeReferences')>()),
  readRangeReferenceRows: mocks.rows,
}));
const headers = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-start/server', () => ({ setResponseHeader: headers }));

const name = { 'en-SG': 'Test', 'zh-Hans': null, ms: null, ta: null };
const rows: RangeReferenceRows = {
  lines: [
    {
      id: 'line',
      name,
      type: 'mrt.high',
      color: '#000000',
      started_at: null,
      platform_door_count: null,
      train_car_counts: [],
      operating_hours: null,
    },
  ],
  lineOperators: [
    {
      line_id: 'line',
      operator_id: 'operator',
      started_at: null,
      ended_at: null,
    },
  ],
  services: [{ id: 'service', line_id: 'line', name }],
  revisions: [
    {
      id: 'revision',
      service_id: 'service',
      start_at: null,
      end_at: null,
      estimated_frequency: null,
      updated_at: '2026-11-18T00:00:00.000Z',
    },
  ],
  stations: ['B', 'A'].map((id) => ({
    id,
    name,
    townId: 'town',
    firstLastTrain: null,
    latitude: 1,
    longitude: 103,
  })),
  stationCodes: [
    {
      line_id: 'line',
      station_id: 'A',
      code: 'A1',
      started_at: '2000-01-01',
      ended_at: null,
      structure_type: 'underground',
    },
  ],
  stationLandmarks: [{ station_id: 'A', landmark_id: 'landmark' }],
};
const raw = (generation = 'pull-a') =>
  JSON.stringify({ version: 1, generation, rows });
let cache: typeof import('./rangeReferenceCache.server');
const tx = {};
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('TIER', 'staging');
  cache = await import('./rangeReferenceCache.server');
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

describe('range-reference cache', () => {
  it('shares bounded reads, preserves row order and unknown car counts, and isolates mutable assembly', async () => {
    vi.setSystemTime(new Date('2026-11-18T00:00:00Z'));
    const [a, b] = await Promise.all([
      cache.readCachedRangeReferences('pull-a'),
      cache.readCachedRangeReferences('pull-a'),
    ]);
    expect(a?.rows).toEqual(rows);
    expect(b?.rows).toEqual(rows);
    expect(mocks.getrange).toHaveBeenCalledExactlyOnceWith(
      cache.getRangeReferenceCacheKey('pull-a'),
      0,
      512 * 1024,
    );
    expect((a?.redisBytes ?? 0) + (b?.redisBytes ?? 0)).toBe(
      Buffer.byteLength(raw()),
    );
    if (!a) throw Error('Expected hit');
    a.rows.stations[0].name['en-SG'] = 'mutated';
    expect(b?.rows).toEqual(rows);
    expect(await cache.readCachedRangeReferences('pull-a')).toMatchObject({
      rows,
      source: 'memory',
      redisBytes: 0,
    });
    vi.setSystemTime(new Date('2026-11-18T00:05:01Z'));
    expect(await cache.readCachedRangeReferences('pull-a')).toMatchObject({
      rows,
      source: 'redis',
    });
    expect(mocks.getrange).toHaveBeenCalledTimes(2);
  });

  it.each([
    '',
    '{',
    raw('other'),
    JSON.stringify({
      version: 1,
      generation: 'pull-a',
      rows: { stations: [] },
    }),
    'x'.repeat(512 * 1024 + 1),
  ])(
    'falls back for missing, malformed, wrong-generation, partial or oversized entries: %#',
    async (value) => {
      mocks.getrange.mockResolvedValue(value);
      expect(
        await cache.readRangeReferencesForSnapshot('pull-a', {
          start: 'a',
          end: 'b',
        }),
      ).toBeUndefined();
      expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
    },
  );

  it('fails open on Redis errors and incomplete generation without publishing on reads', async () => {
    mocks.getrange.mockRejectedValue(Error('Redis timeout'));
    expect(await cache.readCachedRangeReferences('pull-a')).toBeNull();
    mocks.getrange.mockClear();
    expect(
      await cache.readRangeReferencesForSnapshot(undefined, {
        start: 'a',
        end: 'b',
      }),
    ).toBeUndefined();
    expect(mocks.getrange).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('isolates generations, concurrent loads and tiers', async () => {
    const paused = Promise.withResolvers<string>();
    mocks.getrange.mockReturnValueOnce(paused.promise);
    const old = cache.readCachedRangeReferences('pull-a');
    await vi.waitFor(() => expect(mocks.getrange).toHaveBeenCalledOnce());
    expect(await cache.readCachedRangeReferences('pull-b')).toBeNull();
    paused.resolve(raw());
    expect(await old).toMatchObject({ rows });
    mocks.getrange.mockResolvedValue(raw('pull-b'));
    expect(await cache.readCachedRangeReferences('pull-b')).toMatchObject({
      source: 'redis',
    });
    vi.stubEnv('TIER', 'production');
    expect(await cache.readCachedRangeReferences('pull-b')).toMatchObject({
      source: 'redis',
    });
    expect(mocks.getrange).toHaveBeenLastCalledWith(
      'mrtdown:production:range-references:v1:pull-b',
      0,
      512 * 1024,
    );
    expect(await cache.readCachedRangeReferences('')).toBeNull();
  });

  it('publishes one coherent generation and refuses incomplete/mismatching markers', async () => {
    expect(await cache.publishRangeReferenceCache('pull-a')).toMatchObject({
      published: true,
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
    expect(mocks.marker).toHaveBeenCalledWith(tx);
    expect(mocks.rows).toHaveBeenCalledWith(tx);
    expect(mocks.set).toHaveBeenCalledWith(
      cache.getRangeReferenceCacheKey('pull-a'),
      raw(),
      'EX',
      86400,
      'NX',
    );
    mocks.marker.mockResolvedValue(undefined);
    await expect(cache.publishRangeReferenceCache()).rejects.toThrow(
      'completed matching',
    );
    mocks.marker.mockResolvedValue('pull-b');
    await expect(cache.publishRangeReferenceCache('pull-a')).rejects.toThrow(
      'completed matching',
    );
    expect(mocks.set).toHaveBeenCalledOnce();
  });

  it('renews equivalent SQL row sets without rewriting their first published order and rejects changed contents', async () => {
    mocks.set.mockResolvedValue(null);
    mocks.rows.mockResolvedValue({
      ...rows,
      stations: [...rows.stations].reverse(),
    });
    await cache.publishRangeReferenceCache();
    expect(mocks.expire).toHaveBeenCalledWith(
      cache.getRangeReferenceCacheKey('pull-a'),
      86400,
    );
    mocks.rows.mockResolvedValue({ ...rows, stations: [] });
    await expect(cache.publishRangeReferenceCache()).rejects.toThrow(
      'disagree',
    );
    expect(mocks.expire).toHaveBeenCalledOnce();
  });

  it('bounds publication, retries Redis failures, and detects expiry during renewal', async () => {
    mocks.rows.mockResolvedValue({
      ...rows,
      services: [
        { ...rows.services[0], name: { 'en-SG': 'x'.repeat(512 * 1024) } },
      ],
    });
    expect(await cache.publishRangeReferenceCache()).toMatchObject({
      published: false,
    });
    expect(mocks.set).not.toHaveBeenCalled();
    mocks.rows.mockResolvedValue(structuredClone(rows));
    mocks.set.mockRejectedValueOnce(Error('Redis unavailable'));
    await expect(cache.publishRangeReferenceCache()).rejects.toThrow(
      'Redis unavailable',
    );
    mocks.set.mockResolvedValue(null);
    mocks.expire.mockResolvedValue(0);
    await expect(cache.publishRangeReferenceCache()).rejects.toThrow('expired');
  });
});
