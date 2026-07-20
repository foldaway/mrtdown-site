import { recordServerTiming, timeServerSpan } from '~/util/serverTiming';

const SELECT_IN_BATCH_SIZE = 100;

export type AppDb = ReturnType<typeof import('~/db').getDb>;

export async function getDefaultDb() {
  const { getDb } = await import('~/db');
  return getDb();
}

export async function timeDbQuery<T>(name: string, query: () => Promise<T>) {
  return timeServerSpan(name, query);
}

/**
 * Records the transferred row count beside a timed read-model query. Keeping
 * this separate from query duration makes production egress comparisons
 * possible even when the database does not expose statement statistics.
 */
export async function timeDbRowsQuery<T>(
  name: string,
  query: () => Promise<T[]>,
) {
  const rows = await timeDbQuery(name, query);
  recordServerTiming(`${name}_rows`, 0, `rows=${rows.length}`);
  return rows;
}

export function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function selectByIdChunks<T>(
  ids: readonly string[],
  selectBatch: (ids: string[]) => Promise<T[]>,
) {
  const rows: T[] = [];
  for (const batch of chunk(ids, SELECT_IN_BATCH_SIZE)) {
    rows.push(...(await selectBatch(batch)));
  }
  return rows;
}

export function isUndefinedTableError(error: unknown) {
  return (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '42P01'
  );
}
