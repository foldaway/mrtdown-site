import { and, gte, lte, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import { issueDayFactsTable, lineDayFactsTable } from '~/db/schema';
import { timeServerSpan } from '~/util/serverTiming';
import { getDefaultDb, isMissingTableError } from './shared';
import { isoDate } from './temporal';

export type OperationalFactCoverageStart =
  | {
      status: 'available';
      startDate: string;
    }
  | {
      status: 'missing_table';
    };

export async function getIssueDayFactsInRange(
  start: DateTime,
  end: DateTime,
  db?: AppDb,
) {
  const database = db ?? (await getDefaultDb());
  try {
    return await timeServerSpan('fact_issue_day_query', () =>
      database
        .select({
          date: issueDayFactsTable.date,
          issue_id: issueDayFactsTable.issue_id,
          issue_type: issueDayFactsTable.issue_type,
          active_anytime: issueDayFactsTable.active_anytime,
          duration_seconds: issueDayFactsTable.duration_seconds,
        })
        .from(issueDayFactsTable)
        .where(
          and(
            gte(issueDayFactsTable.date, isoDate(start)),
            lte(issueDayFactsTable.date, isoDate(end)),
          ),
        ),
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getOperationalFactCoverageDatesInRange(
  start: DateTime,
  end: DateTime,
  db?: AppDb,
) {
  const database = db ?? (await getDefaultDb());
  try {
    return await timeServerSpan('fact_coverage_query', () =>
      database
        .select({
          date: lineDayFactsTable.date,
        })
        .from(lineDayFactsTable)
        .where(
          and(
            gte(lineDayFactsTable.date, isoDate(start)),
            lte(lineDayFactsTable.date, isoDate(end)),
          ),
        )
        .groupBy(lineDayFactsTable.date),
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getOperationalFactCoverageStart(
  db?: AppDb,
): Promise<OperationalFactCoverageStart> {
  const database = db ?? (await getDefaultDb());
  try {
    const [row] = await timeServerSpan('fact_coverage_start_query', () =>
      database
        .select({
          startDate: sql<string | null>`min(${lineDayFactsTable.date})`,
        })
        .from(lineDayFactsTable),
    );
    if (row?.startDate == null) {
      return {
        status: 'missing_table',
      };
    }
    return {
      status: 'available',
      startDate: row.startDate,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        status: 'missing_table',
      };
    }
    throw error;
  }
}
