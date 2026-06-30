import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../../../db/index.js';
import { metadataTable, publicHolidaysTable } from '../../../db/schema.js';
import { runDbOrderedStatements } from '../../../db/orderedStatements.js';
import { withDbDiagnostics } from '../../../util/dbDiagnostics.js';

const DATA_GOV_PUBLIC_HOLIDAYS_DATASET_ID =
  'd_8ef23381f9417e4d4254ee8b4dcdb176';
const DATA_GOV_DATASTORE_SEARCH_URL =
  'https://data.gov.sg/api/action/datastore_search';
const DATA_GOV_PAGE_LIMIT = 500;
const D1_DELETE_BATCH = 50;
const D1_WRITE_BATCH = 10;
const PENDING_PUBLIC_HOLIDAY_REBUILD_DATES_KEY =
  'public_holidays_pending_rebuild_dates';

type Db = AppDb;

export type PublicHolidaySyncRow = {
  id: string;
  date: string;
  holidayName: string;
  hash: string;
};

export type PublicHolidaySyncResult = {
  fetched: number;
  upserted: number;
  deleted: number;
  changedDates: string[];
  range: {
    start: string;
    end: string;
  } | null;
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const DataGovResponseSchema = z
  .object({
    success: z.boolean(),
    result: z.object({
      records: z.array(z.record(z.string(), z.unknown())),
      total: z.coerce.number().optional(),
    }),
  })
  .passthrough();

function readStringField(
  record: Record<string, unknown>,
  fieldNames: string[],
): string {
  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  throw new Error(`Missing data.gov.sg field: ${fieldNames.join('/')}`);
}

function assertIsoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid public holiday date: ${value}`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isValidCalendarDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day;
  if (!isValidCalendarDate) {
    throw new Error(`Invalid public holiday date: ${value}`);
  }
  return value;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function publicHolidayHash(date: string, holidayName: string): string {
  return JSON.stringify([date, holidayName]);
}

function parsePendingPublicHolidayRebuildDates(value: string | null): string[] {
  if (value == null) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((date): date is string => typeof date === 'string')
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort();
  } catch {
    return [];
  }
}

async function readPendingPublicHolidayRebuildDates(db: Db): Promise<string[]> {
  const rows = await db
    .select({ value: metadataTable.value })
    .from(metadataTable)
    .where(eq(metadataTable.key, PENDING_PUBLIC_HOLIDAY_REBUILD_DATES_KEY))
    .limit(1);

  return parsePendingPublicHolidayRebuildDates(rows[0]?.value ?? null);
}

async function writePendingPublicHolidayRebuildDates(
  tx: Pick<Db, 'insert'>,
  dates: readonly string[],
): Promise<void> {
  const value = JSON.stringify([...new Set(dates)].sort());
  await tx
    .insert(metadataTable)
    .values({
      key: PENDING_PUBLIC_HOLIDAY_REBUILD_DATES_KEY,
      value,
    })
    .onConflictDoUpdate({
      target: [metadataTable.key],
      set: { value },
    });
}

export async function clearPendingPublicHolidayRebuildDates(
  db: Db,
  rebuiltDates: readonly string[],
): Promise<void> {
  if (rebuiltDates.length === 0) {
    return;
  }

  const rebuilt = new Set(rebuiltDates);
  const remaining = (await readPendingPublicHolidayRebuildDates(db)).filter(
    (date) => !rebuilt.has(date),
  );

  await runDbOrderedStatements(db, async (tx) => {
    if (remaining.length === 0) {
      await tx
        .delete(metadataTable)
        .where(eq(metadataTable.key, PENDING_PUBLIC_HOLIDAY_REBUILD_DATES_KEY));
      return;
    }

    await writePendingPublicHolidayRebuildDates(tx, remaining);
  });
}

async function withPublicHolidayDbDiagnostics<T>(
  rows: readonly PublicHolidaySyncRow[],
  operation: () => Promise<T>,
): Promise<T> {
  return withDbDiagnostics(
    {
      prefix: 'PUBLIC_HOLIDAYS_DB_ERROR',
      operation: 'sync',
      table: 'public_holidays',
      rowCount: rows.length,
      sample: rows
        .slice(0, 5)
        .map((row) => `${row.id}:${row.date}:${row.holidayName}`),
    },
    operation,
    { errorName: 'PublicHolidayDbSyncError' },
  );
}

export function normalizeDataGovPublicHolidayRecord(
  record: Record<string, unknown>,
): PublicHolidaySyncRow {
  const date = assertIsoDate(readStringField(record, ['date', 'Date']));
  const holidayName = readStringField(record, ['holiday', 'Holiday']);
  const id = `sg-public-holiday-${date}-${slug(holidayName)}`;

  return {
    id,
    date,
    holidayName,
    hash: publicHolidayHash(date, holidayName),
  };
}

export async function fetchDataGovPublicHolidays(
  fetchImpl: typeof fetch = fetch,
): Promise<PublicHolidaySyncRow[]> {
  const rows: PublicHolidaySyncRow[] = [];
  let offset = 0;

  for (;;) {
    const url = new URL(DATA_GOV_DATASTORE_SEARCH_URL);
    url.searchParams.set('resource_id', DATA_GOV_PUBLIC_HOLIDAYS_DATASET_ID);
    url.searchParams.set('limit', String(DATA_GOV_PAGE_LIMIT));
    url.searchParams.set('offset', String(offset));

    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(
        `data.gov.sg public holidays fetch failed: ${response.status} ${response.statusText}`,
      );
    }

    const parsed = DataGovResponseSchema.parse(await response.json());
    if (!parsed.success) {
      throw new Error('data.gov.sg public holidays response was unsuccessful');
    }

    const pageRows = parsed.result.records.map(
      normalizeDataGovPublicHolidayRecord,
    );
    rows.push(...pageRows);

    const total = parsed.result.total ?? rows.length;
    if (pageRows.length === 0 || rows.length >= total) {
      break;
    }
    offset += pageRows.length;
  }

  return [...new Map(rows.map((row) => [row.id, row])).values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

export async function syncPublicHolidays(
  db: Db,
  rows: readonly PublicHolidaySyncRow[],
): Promise<PublicHolidaySyncResult> {
  if (rows.length === 0) {
    return {
      fetched: 0,
      upserted: 0,
      deleted: 0,
      changedDates: [],
      range: null,
    };
  }

  const sortedRows = [...rows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const start = sortedRows[0].date;
  const end = sortedRows[sortedRows.length - 1].date;
  const incomingIds = new Set(sortedRows.map((row) => row.id));

  const existingRows = await db
    .select()
    .from(publicHolidaysTable)
    .where(
      and(
        gte(publicHolidaysTable.date, start),
        lte(publicHolidaysTable.date, end),
      ),
    );
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const changedDates = new Set<string>();

  for (const row of sortedRows) {
    const existing = existingById.get(row.id);
    if (
      existing == null ||
      existing.date !== row.date ||
      existing.holiday_name !== row.holidayName ||
      existing.hash !== row.hash
    ) {
      changedDates.add(row.date);
    }
  }

  const staleRows = existingRows.filter((row) => !incomingIds.has(row.id));
  for (const row of staleRows) {
    changedDates.add(row.date);
  }
  for (const date of await readPendingPublicHolidayRebuildDates(db)) {
    changedDates.add(date);
  }

  await withPublicHolidayDbDiagnostics(sortedRows, () =>
    runDbOrderedStatements(db, async (tx) => {
      const now = new Date().toISOString();
      const upsertRows = sortedRows.map((row) => ({
        id: row.id,
        date: row.date,
        holiday_name: row.holidayName,
        hash: row.hash,
      }));
      if (changedDates.size > 0) {
        await writePendingPublicHolidayRebuildDates(tx, [...changedDates]);
      }

      for (const rows of chunk(upsertRows, D1_WRITE_BATCH)) {
        for (const row of rows) {
          await tx
            .insert(publicHolidaysTable)
            .values(row)
            .onConflictDoUpdate({
              target: publicHolidaysTable.id,
              set: {
                date: row.date,
                holiday_name: row.holiday_name,
                hash: row.hash,
                updated_at: now,
              },
            });
        }
      }

      for (const ids of chunk(
        staleRows.map((row) => row.id),
        D1_DELETE_BATCH,
      )) {
        await tx
          .delete(publicHolidaysTable)
          .where(inArray(publicHolidaysTable.id, ids));
      }
    }),
  );

  return {
    fetched: sortedRows.length,
    upserted: sortedRows.length,
    deleted: staleRows.length,
    changedDates: [...changedDates].sort(),
    range: { start, end },
  };
}

export async function syncPublicHolidaysFromDataGov(
  db: Db,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicHolidaySyncResult> {
  const rows = await fetchDataGovPublicHolidays(fetchImpl);
  return syncPublicHolidays(db, rows);
}
