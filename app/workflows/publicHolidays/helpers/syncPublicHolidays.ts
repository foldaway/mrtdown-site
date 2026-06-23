import { and, gte, lte, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../../../db/index.js';
import { publicHolidaysTable } from '../../../db/schema.js';
import { withDbDiagnostics } from '../../../util/dbDiagnostics.js';

const DATA_GOV_PUBLIC_HOLIDAYS_DATASET_ID =
  'd_8ef23381f9417e4d4254ee8b4dcdb176';
const DATA_GOV_DATASTORE_SEARCH_URL =
  'https://data.gov.sg/api/action/datastore_search';
const DATA_GOV_PAGE_LIMIT = 500;

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

  await withPublicHolidayDbDiagnostics(sortedRows, () =>
    db.transaction(async (tx) => {
      const now = new Date().toISOString();
      await tx
        .insert(publicHolidaysTable)
        .values(
          sortedRows.map((row) => ({
            id: row.id,
            date: row.date,
            holiday_name: row.holidayName,
            hash: row.hash,
          })),
        )
        .onConflictDoUpdate({
          target: publicHolidaysTable.id,
          set: {
            date: sql.raw(`excluded.${publicHolidaysTable.date.name}`),
            holiday_name: sql.raw(
              `excluded.${publicHolidaysTable.holiday_name.name}`,
            ),
            hash: sql.raw(`excluded.${publicHolidaysTable.hash.name}`),
            updated_at: now,
          },
        });

      await tx
        .delete(publicHolidaysTable)
        .where(
          and(
            gte(publicHolidaysTable.date, start),
            lte(publicHolidaysTable.date, end),
            notInArray(publicHolidaysTable.id, [...incomingIds]),
          ),
        );
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
