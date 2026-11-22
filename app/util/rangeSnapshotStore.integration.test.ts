import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
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
import type { DatasetInputs } from './dbQueries/dataset';
import { z } from 'zod';
import { createSnapshotPartitions } from './snapshotPartitions.server';
import { createPublishedSnapshotStore } from './publishedSnapshotStore.server';
import { createRangeSnapshotStore } from './rangeSnapshotStore.server';

const url = process.env.TEST_SNAPSHOT_REDIS_URL;
const tier = `snapshot_test_${randomUUID().replaceAll('-', '')}`;
const prefix = `mrtdown:{${tier}:range-snapshot:v1}`;
const inputs: DatasetInputs = {
  metadataRows: [],
  linesRows: [],
  lineOperatorsRows: [],
  operatorsRows: [],
  townsRows: [],
  landmarksRows: [],
  stationRows: [],
  stationCodesRows: [],
  stationLandmarksRows: [],
  serviceRows: [],
  serviceRevisionRows: [],
  publicHolidayRows: [],
  issueRows: [],
  latestEvidenceRows: [],
  impactEventRows: [],
  impactEventPeriodRows: [],
  impactEventServiceRows: [],
  impactEventFacilityRows: [],
  impactEventCauseRows: [],
  impactEventServiceScopeRows: [],
  impactEventServiceEffectRows: [],
  impactEventFacilityEffectRows: [],
  servicePathRows: [],
};
const fingerprint = 'a'.repeat(64);

describe.skipIf(!url)('immutable range snapshots with Redis', () => {
  let redis: Redis;
  const connect = async () => redis;
  beforeAll(() => {
    if (!url) throw Error('TEST_SNAPSHOT_REDIS_URL missing');
    redis = new Redis(url);
  });
  beforeEach(() => {
    vi.stubEnv('TIER', tier);
  });
  afterEach(async () => {
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await redis?.quit();
  });

  it('activates complete partitions and preserves retention across retries and eviction', async () => {
    const parts = createSnapshotPartitions(
      connect,
      'range-snapshot',
      z.string().parse,
      { encodedBytes: 1024, jsonBytes: 4096 },
    );
    const manifest = createPublishedSnapshotStore(
      connect,
      'range-snapshot',
      z.array(z.object({ sha256: z.string(), bytes: z.number() })).parse,
    );
    const first = await parts.prepare('first', 1024);
    const old = await parts.prepare('old', 1024);
    expect(
      await redis.ttl(`${prefix}:partition:${first.sha256}`),
    ).toBeGreaterThan(0);
    await manifest.publish('', [first, old], 'complete', fingerprint, {
      active: [first.sha256, old.sha256],
      previous: [],
    });
    await parts.prepare('first', 1024);
    expect(await redis.ttl(`${prefix}:partition:${first.sha256}`)).toBe(-1);
    const head = (await manifest.head()).raw;
    expect(await parts.ready(head, [first.sha256, old.sha256])).toBe(true);
    const next = await parts.prepare('next', 1024);
    await redis.del(`${prefix}:partition:${next.sha256}`);
    const dependencies = {
      active: [first.sha256, next.sha256],
      previous: [first.sha256, old.sha256],
    };
    await expect(
      manifest.publish(
        head,
        [first, next],
        'complete',
        fingerprint,
        dependencies,
      ),
    ).rejects.toThrow('partition missing');
    expect((await manifest.head()).raw).toEqual(head);
    await parts.prepare('next', 1024);
    await manifest.publish(
      head,
      [first, next],
      'complete',
      fingerprint,
      dependencies,
    );
    expect(
      await redis.ttl(`${prefix}:partition:${old.sha256}`),
    ).toBeGreaterThan(0);
    expect(await redis.ttl(`${prefix}:partition:${first.sha256}`)).toBe(-1);
    await redis.del(`${prefix}:partition:${first.sha256}`);
    const active = (await manifest.head()).raw;
    expect(await parts.ready(active, dependencies.active)).toBe(false);
    await parts.prepare('first', 1024);
    await manifest.publish(
      active,
      [first, next],
      'complete',
      fingerprint,
      dependencies,
    );
    expect(await redis.ttl(`${prefix}:partition:${first.sha256}`)).toBe(-1);
    expect(await parts.ready(head, dependencies.active)).toBe(false);
  });

  it('retains the active payload/head without a TTL, survives a cold process and retires only superseded data', async () => {
    const first = createRangeSnapshotStore(connect);
    const old = await first.publish('', inputs, 'old', fingerprint);
    const head = (await first.head()).raw;
    expect(await redis.ttl(`${prefix}:active`)).toBe(-1);
    expect(await redis.ttl(`${prefix}:payload:${old.sha256}`)).toBe(-1);
    const cold = createRangeSnapshotStore(connect);
    expect((await cold.read())?.inputs).toEqual(inputs);
    const next = await cold.publish(
      head,
      { ...inputs, publicHolidayRows: [{ date: '2026-12-25' }] },
      'new',
      fingerprint,
    );
    expect(await redis.ttl(`${prefix}:payload:${next.sha256}`)).toBe(-1);
    expect(await redis.ttl(`${prefix}:payload:${old.sha256}`)).toBeGreaterThan(
      0,
    );
    expect((await first.read())?.value.generation).toBe('new');
    const copy = await first.read();
    if (!copy) throw Error('Published snapshot missing');
    copy.inputs.publicHolidayRows.length = 0;
    expect((await first.read())?.inputs.publicHolidayRows).toHaveLength(1);
  });

  it('rejects delayed publication even when inputs change and then return to their original value', async () => {
    const store = createRangeSnapshotStore(connect);
    await store.publish('', inputs, 'complete', fingerprint);
    const original = (await store.head()).raw;
    const changedInputs = {
      ...inputs,
      publicHolidayRows: [{ date: '2026-12-25' }],
    };
    await store.publish(original, changedInputs, 'complete', fingerprint);
    await store.publish(
      (await store.head()).raw,
      inputs,
      'complete',
      fingerprint,
    );
    await expect(
      store.publish(original, changedInputs, 'complete', fingerprint),
    ).rejects.toThrow('superseded');
    expect((await store.read())?.inputs).toEqual(inputs);
  });

  it('requires a completed checkpoint and a recoverable payload before skipping an unchanged poll', async () => {
    const store = createRangeSnapshotStore(connect);
    const value = await store.publish('', inputs, 'complete', fingerprint);
    expect(await store.isCurrent(fingerprint)).toBe(false);
    await store.complete(fingerprint);
    expect(await store.isCurrent(fingerprint)).toBe(true);
    await store.invalidateCompletion();
    expect(await store.isCurrent(fingerprint)).toBe(false);
    expect((await store.read())?.inputs).toEqual(inputs);
    await store.complete(fingerprint);
    await redis.del(`${prefix}:payload:${value.sha256}`);
    expect(await store.isCurrent(fingerprint)).toBe(false);
  });

  it.each(['head', 'payload', 'schema', 'oversized', 'decompression'] as const)(
    'rejects %s corruption in a cold reader',
    async (failure) => {
      const store = createRangeSnapshotStore(connect);
      const value = await store.publish('', inputs, 'complete', fingerprint);
      const key = `${prefix}:payload:${value.sha256}`;
      if (failure === 'head') await redis.set(`${prefix}:active`, '{}');
      if (failure === 'payload') await redis.set(key, 'corrupt');
      if (failure === 'oversized')
        await redis.set(key, 'x'.repeat(4 * 1024 * 1024 + 1));
      if (failure === 'schema' || failure === 'decompression') {
        const raw = gzipSync(
          failure === 'schema' ? '{}' : 'x'.repeat(24 * 1024 * 1024 + 1),
        ).toString('base64');
        const hash = createHash('sha256').update(raw).digest('hex');
        await redis.set(`${prefix}:payload:${hash}`, raw);
        await redis.set(
          `${prefix}:active`,
          JSON.stringify({ ...value, sha256: hash }),
        );
      }
      expect(await createRangeSnapshotStore(connect).read()).toBeNull();
    },
  );

  it('repairs an evicted or corrupt content-addressed payload even when its hash is unchanged', async () => {
    const store = createRangeSnapshotStore(connect);
    const original = await store.publish('', inputs, 'complete', fingerprint);
    const head = (await store.head()).raw;
    await redis.set(`${prefix}:payload:${original.sha256}`, 'corrupt');
    expect(await store.isCurrent(fingerprint)).toBe(false);
    await store.publish(head, inputs, 'complete', fingerprint);
    expect((await createRangeSnapshotStore(connect).read())?.inputs).toEqual(
      inputs,
    );
  });

  it.each(['json', 'utf8', 'oversized'] as const)(
    'repairs %s heads without weakening compare-and-swap',
    async (failure) => {
      const store = createRangeSnapshotStore(connect);
      await store.publish('', inputs, 'initial', fingerprint);
      const valid = (await store.head()).raw.toString();
      const corrupt =
        failure === 'utf8'
          ? Buffer.from([0xc3, 0x28])
          : failure === 'oversized'
            ? valid.padEnd(2049, ' ') + 'invalid tail'
            : '{}';
      await redis.set(`${prefix}:active`, corrupt);
      const expected = await store.head();
      expect(expected.value).toBeUndefined();
      expect(await createRangeSnapshotStore(connect).read()).toBeNull();
      await store.publish(expected.raw, inputs, 'repaired', fingerprint);
      expect((await store.read())?.value.generation).toBe('repaired');
      await expect(
        store.publish(expected.raw, inputs, 'stale', fingerprint),
      ).rejects.toThrow('superseded');
    },
  );
});
