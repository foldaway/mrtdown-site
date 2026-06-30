import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const database = {
    batch: vi.fn(),
    prepare: vi.fn(),
  };
  const drizzleDb = {
    batch: vi.fn(),
    insert: vi.fn(),
    run: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
  };
  return {
    env: { DB: database as unknown as D1Database },
    database,
    drizzle: vi.fn(() => drizzleDb),
    drizzleDb,
  };
});

vi.mock('cloudflare:workers', () => ({
  env: mocks.env,
}));

vi.mock('drizzle-orm/d1', () => ({
  drizzle: mocks.drizzle,
}));

describe('getDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.DB = mocks.database as unknown as D1Database;
  });

  it('creates a Drizzle D1 database from the Worker DB binding', async () => {
    const { getDb } = await import('./index');

    const db = getDb();

    expect(mocks.drizzle).toHaveBeenCalledWith(
      mocks.database,
      expect.objectContaining({
        relations: expect.any(Object),
        schema: expect.any(Object),
      }),
    );
    expect(db).toBe(mocks.drizzleDb);
    expect(db).toEqual(
      expect.objectContaining({
        batch: expect.any(Function),
        insert: expect.any(Function),
        run: expect.any(Function),
        select: expect.any(Function),
        transaction: expect.any(Function),
      }),
    );
  });

  it('fails clearly when the D1 binding is missing', async () => {
    const { getDb } = await import('./index');
    mocks.env.DB = undefined as unknown as D1Database;

    expect(() => getDb()).toThrow('Missing DB D1 binding');
  });
});
