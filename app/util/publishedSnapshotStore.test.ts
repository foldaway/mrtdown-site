import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createPublishedSnapshotStore,
  type SnapshotRedis,
} from './publishedSnapshotStore.server';
import { encodeSnapshotPayload } from './snapshotPayload.server';

const schema = z.object({ rows: z.array(z.object({ id: z.string() })) });
const inputs = { rows: [{ id: 'first' }] };
const encoded = encodeSnapshotPayload(inputs, schema.parse);
const makeHead = (hash = encoded.sha256, generation = 'first') =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      publicationId: randomUUID(),
      sha256: hash,
      generation,
      fingerprint: 'a'.repeat(64),
    }),
  );

function fixture() {
  const redis = {
    getrange: vi.fn<SnapshotRedis['getrange']>(),
    getrangeBuffer: vi.fn<SnapshotRedis['getrangeBuffer']>(),
  };
  redis.getrange.mockResolvedValue(encoded.encoded);
  redis.getrangeBuffer.mockResolvedValue(makeHead());
  const parse = vi.fn(schema.parse);
  const unexpectedWrite = async () => {
    throw Error('Read test attempted snapshot publication');
  };
  const store = createPublishedSnapshotStore(
    async (): Promise<SnapshotRedis> => ({
      ...redis,
      set: unexpectedWrite,
      eval: unexpectedWrite,
      del: unexpectedWrite,
    }),
    'station-profiles',
    parse,
  );
  return { redis, parse, store };
}

afterEach(() => vi.unstubAllEnvs());

describe('concurrent published snapshot reads', () => {
  it('checks each head but shares one cold fetch/decode and isolates caller copies', async () => {
    const { redis, parse, store } = fixture();
    const payload = Promise.withResolvers<string>();
    redis.getrange.mockReturnValueOnce(payload.promise);
    const reads = [
      store.readSelected((value) => value.rows),
      store.readSelected((value) => value.rows),
      store.readSelected((value) => value.rows),
    ];
    await vi.waitFor(() => expect(redis.getrange).toHaveBeenCalledTimes(1));
    payload.resolve(encoded.encoded);
    const results = await Promise.all(reads);
    expect(redis.getrangeBuffer).toHaveBeenCalledTimes(3);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(results.map((value) => value?.inputs)).toEqual([
      inputs.rows,
      inputs.rows,
      inputs.rows,
    ]);
    expect(
      results.reduce((bytes, value) => bytes + (value?.redisBytes ?? 0), 0),
    ).toBe(encoded.bytes);
    const first = results[0];
    if (!first) throw Error('Missing snapshot');
    first.inputs[0].id = 'mutated';
    expect(results[1]?.inputs[0].id).toBe('first');
    expect((await store.read())?.inputs).toEqual(inputs);
    expect(redis.getrange).toHaveBeenCalledTimes(1);
  });

  it('keeps pending publication inputs separate and does not let an old load evict the new memo', async () => {
    const { redis, store } = fixture();
    const next = encodeSnapshotPayload(
      { rows: [{ id: 'next' }] },
      schema.parse,
    );
    const old = Promise.withResolvers<string>();
    redis.getrange.mockReturnValueOnce(old.promise);
    const originals = [store.read(), store.read()];
    await vi.waitFor(() => expect(redis.getrange).toHaveBeenCalledTimes(1));
    redis.getrangeBuffer.mockResolvedValue(makeHead(next.sha256, 'next'));
    redis.getrange.mockResolvedValue(next.encoded);
    const current = await store.read();
    expect(current?.inputs.rows[0].id).toBe('next');
    old.resolve(encoded.encoded);
    expect(
      (await Promise.all(originals)).map((value) => value?.inputs.rows[0].id),
    ).toEqual(['first', 'first']);
    expect((await store.read())?.inputs.rows[0].id).toBe('next');
    expect(redis.getrange).toHaveBeenCalledTimes(2);
  });

  it('clears a failed shared load so subsequent reads can recover', async () => {
    const { redis, store } = fixture();
    const payload = Promise.withResolvers<string>();
    redis.getrange.mockReturnValueOnce(payload.promise);
    const reads = [store.read(), store.read()];
    await vi.waitFor(() => expect(redis.getrange).toHaveBeenCalledTimes(1));
    payload.reject(Error('Command timed out'));
    expect(await Promise.all(reads)).toEqual([null, null]);
    expect((await store.read())?.inputs).toEqual(inputs);
    expect(redis.getrange).toHaveBeenCalledTimes(2);
  });

  it.each(['', 'corrupt'])(
    'does not retain a missing or corrupt shared payload (%j)',
    async (raw) => {
      const { redis, store } = fixture();
      const payload = Promise.withResolvers<string>();
      redis.getrange.mockReturnValueOnce(payload.promise);
      const reads = [store.read(), store.read()];
      await vi.waitFor(() => expect(redis.getrange).toHaveBeenCalledTimes(1));
      payload.resolve(raw);
      expect(await Promise.all(reads)).toEqual([null, null]);
      expect((await store.read())?.inputs).toEqual(inputs);
    },
  );

  it('verifies Redis independently of an in-flight fill and a warm memo', async () => {
    const { redis, store } = fixture();
    const payload = Promise.withResolvers<string>();
    redis.getrange.mockReturnValueOnce(payload.promise);
    const ordinary = store.read();
    await vi.waitFor(() => expect(redis.getrange).toHaveBeenCalledTimes(1));
    redis.getrange.mockResolvedValue('corrupt');
    expect(await store.read({ verifyPayload: true })).toBeNull();
    payload.resolve(encoded.encoded);
    expect((await ordinary)?.inputs).toEqual(inputs);
    expect((await store.read())?.source).toBe('memory');
    expect(await store.read({ verifyPayload: true })).toBeNull();
    expect(redis.getrange).toHaveBeenCalledTimes(3);
  });

  it('clears a shared schema failure without memoizing invalid inputs', async () => {
    const { redis, store } = fixture();
    const invalid = encodeSnapshotPayload({ rows: null }, (value) => value);
    redis.getrangeBuffer.mockResolvedValue(makeHead(invalid.sha256));
    const payload = Promise.withResolvers<string>();
    redis.getrange.mockReturnValueOnce(payload.promise);
    const reads = [store.read(), store.read()];
    await vi.waitFor(() => expect(redis.getrange).toHaveBeenCalledTimes(1));
    payload.resolve(invalid.encoded);
    expect(await Promise.all(reads)).toEqual([null, null]);
    redis.getrangeBuffer.mockResolvedValue(makeHead());
    expect((await store.read())?.inputs).toEqual(inputs);
  });

  it('keys pending loads by the full tier-specific payload key', async () => {
    const { redis, store } = fixture();
    vi.stubEnv('TIER', 'first');
    const payload = Promise.withResolvers<string>();
    redis.getrange.mockReturnValueOnce(payload.promise);
    const first = store.read();
    await vi.waitFor(() => expect(redis.getrange).toHaveBeenCalledTimes(1));
    vi.stubEnv('TIER', 'second');
    expect((await store.read())?.inputs).toEqual(inputs);
    expect(redis.getrange).toHaveBeenCalledTimes(2);
    expect(redis.getrange.mock.calls[0][0]).toContain('{first:');
    expect(redis.getrange.mock.calls[1][0]).toContain('{second:');
    payload.resolve(encoded.encoded);
    expect((await first)?.inputs).toEqual(inputs);
  });
});
