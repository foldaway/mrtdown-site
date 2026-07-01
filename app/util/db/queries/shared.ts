import { sql } from 'drizzle-orm';
import { metadataTable } from '~/db/schema';
import { timeServerSpan } from '~/util/serverTiming';

const D1_SELECT_IN_BATCH = 90;
const CROWD_REPORT_DUPLICATE_LOCK_METADATA_PREFIX =
  'crowd_report_duplicate_lock:';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function readStringField(value: unknown, field: string) {
  if (!isRecord(value)) {
    return null;
  }

  const fieldValue = value[field];
  return typeof fieldValue === 'string' ? fieldValue : null;
}

export function isMissingTableError(error: unknown) {
  let current: unknown = error;
  const seen = new Set<unknown>();

  for (let depth = 0; current != null && depth < 6; depth++) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);

    const code = readStringField(current, 'code');
    if (code === '42P01') {
      return true;
    }

    const message =
      current instanceof Error
        ? current.message
        : readStringField(current, 'message');
    if (
      message != null &&
      /\bno such table\b/i.test(message) &&
      (message.includes('D1_ERROR') ||
        message.includes('SQLITE_ERROR') ||
        code === 'SQLITE_ERROR')
    ) {
      return true;
    }

    current = isRecord(current) ? current.cause : null;
  }

  return false;
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
  for (const batch of chunk(ids, D1_SELECT_IN_BATCH)) {
    rows.push(...(await selectBatch(batch)));
  }
  return rows;
}

export async function getDefaultDb() {
  const { getDb } = await import('~/db');
  return getDb();
}

export async function timeDbQuery<T>(name: string, query: () => Promise<T>) {
  return timeServerSpan(name, query);
}

export function publicMetadataKeySql() {
  return sql`${metadataTable.key} not like ${`${CROWD_REPORT_DUPLICATE_LOCK_METADATA_PREFIX}%`}`;
}
