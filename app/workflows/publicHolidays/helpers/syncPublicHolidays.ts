import { randomUUID } from 'node:crypto';
import { and, eq, gte, lte, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { getDb } from '../../../db/index.js';
import { metadataTable, publicHolidaysTable } from '../../../db/schema.js';
import { withDbDiagnostics } from '../../../util/dbDiagnostics.js';

import {
  acquireOrRenewPullWorkflowLease,
  releasePullWorkflowLease,
} from '../../pull/helpers/workflowLease.js';
import { beginPublicHolidaySync } from './syncCheckpoint.js';

import { PENDING_HOLIDAY_DATES_KEY } from '~/util/dbQueries/operationalFacts';
export { PENDING_HOLIDAY_DATES_KEY } from '~/util/dbQueries/operationalFacts';

const DATA_GOV_PUBLIC_HOLIDAYS_DATASET_ID =
  'd_8ef23381f9417e4d4254ee8b4dcdb176';
const DATA_GOV_DATASTORE_SEARCH_URL =
  'https://data.gov.sg/api/action/datastore_search';
const DATA_GOV_PAGE_LIMIT = 500;

type Db = ReturnType<typeof getDb>;

export type PublicHolidaySyncRow = {
  id: string;
  date: string;
  holidayName: string;
  hash: string;
};

export type PublicHolidaySyncResult = {
  checkpointToken?: string;
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
      total: z.coerce.number().int().nonnegative(),
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

    const total = parsed.result.total;
    if (rows.length > total || (pageRows.length === 0 && rows.length < total))
      throw new Error('Incomplete data.gov.sg public holidays response');
    if (rows.length >= total) {
      break;
    }
    offset += pageRows.length;
  }

  if (rows.length === 0)
    throw new Error('Empty data.gov.sg public holidays response');
  return [...new Map(rows.map((row) => [row.id, row])).values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

async function syncPublicHolidayRows(
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

  return withPublicHolidayDbDiagnostics(sortedRows, () =>
    db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(publicHolidaysTable)
        .where(
          and(
            gte(publicHolidaysTable.date, start),
            lte(publicHolidaysTable.date, end),
          ),
        );
      const existingById = new Map(existingRows.map((row) => [row.id, row]));
      const pending = await tx
        .select({ value: metadataTable.value })
        .from(metadataTable)
        .where(eq(metadataTable.key, PENDING_HOLIDAY_DATES_KEY));
      // A previous run may have committed its rows before facts/publication failed.
      const changedDates = new Set<string>(
        pending[0]
          ? z.array(z.iso.date()).parse(JSON.parse(pending[0].value))
          : [],
      );

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

      const pendingDates = JSON.stringify([...changedDates].sort());
      await tx
        .insert(metadataTable)
        .values({
          key: PENDING_HOLIDAY_DATES_KEY,
          value: pendingDates,
        })
        .onConflictDoUpdate({
          target: metadataTable.key,
          set: { value: pendingDates },
        });
      const now = new Date();
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
      return {
        fetched: sortedRows.length,
        upserted: sortedRows.length,
        deleted: staleRows.length,
        changedDates: [...changedDates].sort(),
        range: { start, end },
      };
    }),
  );
}

/**
 * Serialize holiday work with canonical publication. Keep the lease on success
 * for the next durable step; failures release it so a retry can recover.
 */
export async function withPublicHolidayLease<T>(
  db: Db,
  owner: string,
  work: () => Promise<T>,
) {
  if (!(await acquireOrRenewPullWorkflowLease(db, owner)))
    throw new Error('Another data writer holds the workflow lease');
  try {
    return await work();
  } catch (error) {
    await releasePullWorkflowLease(db, owner);
    throw error;
  }
}

export async function syncPublicHolidays(
  db: Db,
  rows: readonly PublicHolidaySyncRow[],
  owner?: string,
): Promise<PublicHolidaySyncResult> {
  const leaseOwner = owner ?? randomUUID();
  try {
    return await withPublicHolidayLease(db, leaseOwner, async () => {
      const checkpointToken = await beginPublicHolidaySync();
      return { ...(await syncPublicHolidayRows(db, rows)), checkpointToken };
    });
  } finally {
    // Workflow callers retain ownership through facts, publication and purge.
    if (!owner) await releasePullWorkflowLease(db, leaseOwner);
  }
}

export async function syncPublicHolidaysFromDataGov(
  db: Db,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicHolidaySyncResult> {
  const rows = await fetchDataGovPublicHolidays(fetchImpl);
  return syncPublicHolidays(db, rows);
}
