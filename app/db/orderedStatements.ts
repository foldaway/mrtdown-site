import type { AppDb } from './index.js';

export type AppDbStatementRunner = Parameters<
  Parameters<AppDb['transaction']>[0]
>[0];

/**
 * Runs a sequence of Drizzle D1 statements without opening an interactive SQL
 * transaction. D1 supports atomic prebuilt batches, but not the interactive
 * `db.transaction(async tx => ...)` shape Drizzle emits with BEGIN/SAVEPOINT.
 */
export async function runDbOrderedStatements<T>(
  db: AppDb,
  callback: (runner: AppDbStatementRunner) => T | Promise<T>,
): Promise<T> {
  return callback(db as unknown as AppDbStatementRunner);
}
