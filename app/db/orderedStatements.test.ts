import { describe, expect, it } from 'vitest';
import type { AppDb } from './index.js';
import { runDbOrderedStatements } from './orderedStatements.js';

describe('runDbOrderedStatements', () => {
  it('runs the callback against the base Drizzle DB without opening a transaction', async () => {
    const db = {
      marker: 'base-db',
      transaction() {
        throw new Error('transaction should not be called');
      },
    } as unknown as AppDb & { marker: string };

    const result = await runDbOrderedStatements(db, async (runner) => {
      expect(runner).toBe(db);
      return 'ok';
    });

    expect(result).toBe('ok');
  });
});
