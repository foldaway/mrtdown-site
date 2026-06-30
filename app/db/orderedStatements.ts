import type { AppDb } from './index.js';

export type AppDbStatementRunner = Pick<
  AppDb,
  'delete' | 'insert' | 'select' | 'update'
>;

/**
 * Runs a sequence of Drizzle D1 statements inside one SQL transaction so
 * delete-then-insert refreshes and lock/update flows cannot partially commit.
 */
export async function runDbOrderedStatements<T>(
  db: AppDb,
  callback: (runner: AppDbStatementRunner) => T | Promise<T>,
): Promise<T> {
  const transaction = (
    db as AppDb & {
      transaction?: AppDb['transaction'];
    }
  ).transaction;
  if (typeof transaction !== 'function') {
    return callback(db as unknown as AppDbStatementRunner);
  }

  return transaction.call(db, async (tx) =>
    callback(tx as unknown as AppDbStatementRunner),
  ) as Promise<T>;
}
