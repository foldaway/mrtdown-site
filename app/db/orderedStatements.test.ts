import { describe, expect, it } from 'vitest';
import type { AppDb } from './index.js';
import { runDbOrderedStatements } from './orderedStatements.js';

describe('runDbOrderedStatements', () => {
  it('runs the callback inside the Drizzle D1 transaction runner', async () => {
    const transactionRunner = {
      marker: 'transaction-db',
    };
    const db = {
      marker: 'base-db',
      transaction(callback: (tx: typeof transactionRunner) => Promise<string>) {
        return callback(transactionRunner);
      },
    } as unknown as AppDb & { marker: string };

    const result = await runDbOrderedStatements(db, async (runner) => {
      expect(runner).toBe(transactionRunner);
      return 'ok';
    });

    expect(result).toBe('ok');
  });

  it('keeps lightweight test doubles usable when they only implement statement methods', async () => {
    const db = {
      marker: 'fake-statement-runner',
    } as unknown as AppDb & { marker: string };

    const result = await runDbOrderedStatements(db, async (runner) => {
      expect(runner).toBe(db);
      return 'ok';
    });

    expect(result).toBe('ok');
  });
});
