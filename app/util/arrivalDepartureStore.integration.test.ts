import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createArrivalDepartureStore } from './arrivalDepartureStore.server';
import type { DeparturePartition } from './dbQueries/departurePartition';

const url = process.env.TEST_SNAPSHOT_REDIS_URL;
const tier = `departure_test_${randomUUID().replaceAll('-', '')}`;
const prefix = `mrtdown:{${tier}:arrival-departures:v1}`;
const fingerprint = 'a'.repeat(64);
const inputsHash = 'b'.repeat(64);
const partition: DeparturePartition = {
  projectionId: 1,
  stationId: 'station',
  calls: [],
};

describe.skipIf(!url)('departure publication with Redis', () => {
  let redis: Redis;
  const store = () => createArrivalDepartureStore(async () => redis);
  beforeAll(() => {
    if (!url) throw new Error('TEST_SNAPSHOT_REDIS_URL missing');
    redis = new Redis(url);
  });
  beforeEach(() => vi.stubEnv('TIER', tier));
  afterEach(async () => {
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await redis?.quit();
  });

  it('activates all parts together, preserves shared active parts and retires old data', async () => {
    const writer = store();
    const first = await writer.prepare(partition);
    const old = await writer.prepare({ ...partition, stationId: 'old' });
    expect(
      await redis.ttl(`${prefix}:partition:${first.sha256}`),
    ).toBeGreaterThan(0);
    const head = await writer.manifest.head();
    const inputs = {
      arrivalInputsSha256: inputsHash,
      partitions: [first, old],
    };
    await writer.publish(head.raw, inputs, 'generation', fingerprint, []);
    expect(await redis.ttl(`${prefix}:partition:${first.sha256}`)).toBe(-1);
    const snapshot = await store().manifest.read();
    if (!snapshot) throw Error('Missing manifest');
    expect(await writer.ready(snapshot)).toBe(true);
    expect(await store().readPartition(snapshot, first)).toEqual(partition);
    // Replaying an acknowledged-lost activation is safe with the original CAS.
    await writer.publish(head.raw, inputs, 'generation', fingerprint, []);
    await writer.prepare(partition);
    expect(await redis.ttl(`${prefix}:partition:${first.sha256}`)).toBe(-1);
    await expect(writer.prepare(partition, 1)).rejects.toThrow(
      'total Redis limit',
    );

    const next = await writer.prepare({ ...partition, stationId: 'next' });
    const expected = (await writer.manifest.head()).raw;
    await redis.del(`${prefix}:partition:${next.sha256}`);
    await expect(
      writer.publish(
        expected,
        { arrivalInputsSha256: inputsHash, partitions: [first, next] },
        'generation',
        fingerprint,
        [first, old],
      ),
    ).rejects.toThrow('partition missing');
    expect((await writer.manifest.head()).raw).toEqual(expected);
    expect(await redis.ttl(`${prefix}:partition:${old.sha256}`)).toBe(-1);
    await writer.prepare({ ...partition, stationId: 'next' });
    await writer.publish(
      expected,
      { arrivalInputsSha256: inputsHash, partitions: [first, next] },
      'generation',
      fingerprint,
      [first, old],
    );
    expect(await redis.ttl(`${prefix}:partition:${first.sha256}`)).toBe(-1);
    expect(
      await redis.ttl(`${prefix}:partition:${old.sha256}`),
    ).toBeGreaterThan(0);
    await expect(
      writer.publish(expected, inputs, 'generation', fingerprint, [first, old]),
    ).rejects.toThrow('superseded');
  });

  it('detects eviction/corruption, repairs it and ignores repair signals from old readers', async () => {
    const writer = store();
    const ref = await writer.prepare(partition);
    const inputs = { arrivalInputsSha256: inputsHash, partitions: [ref] };
    await writer.publish(
      (await writer.manifest.head()).raw,
      inputs,
      'one',
      fingerprint,
      [],
    );
    const old = await writer.manifest.read();
    if (!old) throw Error('Missing manifest');
    await redis.del(`${prefix}:partition:${ref.sha256}`);
    expect(await writer.ready(old)).toBe(false);
    await writer.prepare(partition);
    await writer.publish(old.raw, inputs, 'one', fingerprint, [ref]);
    expect(await redis.ttl(`${prefix}:partition:${ref.sha256}`)).toBe(-1);
    const repaired = await writer.manifest.read();
    if (!repaired) throw Error('Missing repaired manifest');
    await redis.set(`${prefix}:partition:${ref.sha256}`, 'corrupt');
    expect(await store().readPartition(repaired, ref)).toBeNull();
    expect(await writer.ready(old)).toBe(false);
    await writer.prepare(partition);
    await writer.publish(repaired.raw, inputs, 'two', fingerprint, [ref]);
    const fresh = await store().manifest.read();
    if (!fresh) throw Error('Missing manifest');
    expect(await writer.ready(fresh)).toBe(true);
    await redis.del(`${prefix}:partition:${ref.sha256}`);
    expect(await writer.readPartition(old, ref)).toBeNull();
    expect(await redis.exists(`${prefix}:repair`)).toBe(0);
    await writer.prepare(partition);
    expect(await writer.ready(fresh)).toBe(true);
  });
});
