import type { AppDb } from './index.js';

export type AppDbStatementRunner = Pick<
  AppDb,
  'delete' | 'insert' | 'select' | 'update'
>;

/**
 * Runs a sequence of Drizzle D1 statements in order. Cloudflare D1 Worker
 * bindings reject explicit BEGIN/COMMIT statements, so callers must keep these
 * flows idempotent or use D1-compatible batch APIs at the statement level.
 */
export async function runDbOrderedStatements<T>(
  db: AppDb,
  callback: (runner: AppDbStatementRunner) => T | Promise<T>,
): Promise<T> {
  return callback(db as unknown as AppDbStatementRunner);
}
