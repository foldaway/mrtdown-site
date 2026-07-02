import { inArray } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import { runDbOrderedStatements } from '~/db/orderedStatements';
import { issueDayFactsTable, lineDayFactsTable } from '~/db/schema';
import type { Line } from '~/types';
import { issueContributesToLineDowntime } from '~/util/issueOperationalEffects';
import {
  clipIntervalToRange,
  clipIssueIntervalsToRange,
  getIssueBounds,
  issueActiveNow,
  issueTouchesDate,
  sumIntervalSeconds,
} from './issueIntervals';
import {
  createIssueTypeCounts,
  createIssueTypeIntervalGroups,
  sumIssueTypeIntervalGroups,
  addIssueTypeCount,
} from './issueTypeStats';
import { isLineFuture, serviceWindowForDate } from './lineService';
import { buildBaseDataset } from './baseDataset';
import { chunk, getDefaultDb } from './shared';
import { isoDate, isoDateTime, nowSg, SG_TIMEZONE } from './temporal';
import type { BaseDataset, IssueWithOperationalEffects } from './types';

export { rebuildStatisticsSnapshot } from './legacy';

const OPERATIONAL_FACTS_REBUILD_DAY_BATCH = 30;
const OPERATIONAL_FACTS_WRITE_BATCH = 10;

type OperationalFactsRebuildContext = {
  issues: IssueWithOperationalEffects[];
  lines: Line[];
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>;
};

type OperationalFactRowsForDate = {
  date: string;
  issueRows: (typeof issueDayFactsTable.$inferInsert)[];
  lineRows: (typeof lineDayFactsTable.$inferInsert)[];
};

function buildOperationalFactsRebuildContext(
  dataset: BaseDataset,
): OperationalFactsRebuildContext {
  const issues = Object.values(dataset.allIssues);

  return {
    issues,
    lines: Object.values(dataset.included.lines),
    issuesByLineId: dataset.issuesByLineId,
  };
}

function buildLineOperationalFactRow(
  line: Line,
  lineIssues: IssueWithOperationalEffects[],
  normalizedDate: DateTime,
  publicHolidaySet: Set<string>,
  asOf: DateTime,
): typeof lineDayFactsTable.$inferInsert {
  const issueCounts = createIssueTypeCounts();
  const downtimeIntervalsByIssueType = createIssueTypeIntervalGroups();
  const lineFuture = isLineFuture(line, normalizedDate.endOf('day'));
  const serviceWindow = serviceWindowForDate(
    line,
    normalizedDate,
    publicHolidaySet,
  );

  for (const issue of lineIssues) {
    if (issueTouchesDate(issue, normalizedDate)) {
      addIssueTypeCount(issueCounts, issue.type, 1);
    }

    if (lineFuture || !issueContributesToLineDowntime(issue)) {
      continue;
    }

    downtimeIntervalsByIssueType[issue.type].push(
      ...clipIssueIntervalsToRange(
        issue,
        serviceWindow.start,
        serviceWindow.end,
        asOf,
      ),
    );
  }

  const downtimeSeconds = sumIssueTypeIntervalGroups(
    downtimeIntervalsByIssueType,
    asOf,
  );

  return {
    date: isoDate(normalizedDate),
    line_id: line.id,
    as_of: isoDateTime(asOf),
    service_seconds: Math.round(lineFuture ? 0 : serviceWindow.seconds),
    downtime_disruption_seconds: Math.round(downtimeSeconds.disruption),
    downtime_maintenance_seconds: Math.round(downtimeSeconds.maintenance),
    downtime_infra_seconds: Math.round(downtimeSeconds.infra),
    issue_count_disruption: issueCounts.disruption,
    issue_count_maintenance: issueCounts.maintenance,
    issue_count_infra: issueCounts.infra,
  };
}

function buildOperationalFactRowsForDate(
  date: DateTime,
  dataset: BaseDataset,
  context: OperationalFactsRebuildContext,
): OperationalFactRowsForDate {
  const normalizedDate = date.setZone(SG_TIMEZONE).startOf('day');
  const asOf = normalizedDate.endOf('day');
  const dateKey = isoDate(normalizedDate);
  const dayEnd = normalizedDate.plus({ days: 1 });

  const issueRows = context.issues
    .map((issue) => {
      const intervals = getIssueBounds(issue)
        .map((interval) =>
          clipIntervalToRange(
            interval.start,
            interval.end,
            normalizedDate,
            dayEnd,
            asOf,
          ),
        )
        .filter((interval) => interval != null);
      const durationSeconds = sumIntervalSeconds(intervals, asOf);

      return {
        date: dateKey,
        issue_id: issue.id,
        issue_type: issue.type,
        as_of: isoDateTime(asOf),
        active_anytime: durationSeconds > 0,
        active_end_of_day: issueActiveNow(issue, asOf),
        duration_seconds: Math.round(durationSeconds),
        inferred_interval_count: 0,
      };
    })
    .filter((row) => row.active_anytime || row.active_end_of_day);

  const lineRows = context.lines.map((line) =>
    buildLineOperationalFactRow(
      line,
      context.issuesByLineId[line.id] ?? [],
      normalizedDate,
      dataset.publicHolidaySet,
      asOf,
    ),
  );

  return {
    date: dateKey,
    issueRows,
    lineRows,
  };
}

async function replaceOperationalFactRows(
  database: AppDb,
  rowsByDate: OperationalFactRowsForDate[],
) {
  const dates = rowsByDate.map((rows) => rows.date);
  const issueRows = rowsByDate.flatMap((rows) => rows.issueRows);
  const lineRows = rowsByDate.flatMap((rows) => rows.lineRows);

  await runDbOrderedStatements(database, async (tx) => {
    for (const batch of chunk(dates, OPERATIONAL_FACTS_REBUILD_DAY_BATCH)) {
      if (batch.length === 0) {
        continue;
      }
      await tx
        .delete(issueDayFactsTable)
        .where(inArray(issueDayFactsTable.date, batch));
      await tx
        .delete(lineDayFactsTable)
        .where(inArray(lineDayFactsTable.date, batch));
    }

    for (const batch of chunk(issueRows, OPERATIONAL_FACTS_WRITE_BATCH)) {
      if (batch.length > 0) {
        await tx.insert(issueDayFactsTable).values(batch);
      }
    }
    for (const batch of chunk(lineRows, OPERATIONAL_FACTS_WRITE_BATCH)) {
      if (batch.length > 0) {
        await tx.insert(lineDayFactsTable).values(batch);
      }
    }
  });
}

async function rebuildOperationalFactsForDateFromDataset(
  date: DateTime,
  dataset: BaseDataset,
  db?: AppDb,
  context = buildOperationalFactsRebuildContext(dataset),
) {
  const database = db ?? (await getDefaultDb());
  const rows = buildOperationalFactRowsForDate(date, dataset, context);

  await replaceOperationalFactRows(database, [rows]);

  return {
    date: rows.date,
    issueCount: rows.issueRows.length,
    lineCount: rows.lineRows.length,
  };
}

export async function rebuildOperationalFactsForDate(
  date: DateTime,
  db?: AppDb,
) {
  const normalizedDate = date.setZone(SG_TIMEZONE).startOf('day');
  const dataset = await buildBaseDataset(normalizedDate.endOf('day'), db);
  return rebuildOperationalFactsForDateFromDataset(normalizedDate, dataset, db);
}

export async function rebuildOperationalFactsForDates(
  dates: readonly string[],
  db?: AppDb,
) {
  const normalizedDates = [
    ...new Set(
      dates.map((date) => {
        const parsed = DateTime.fromISO(date, { zone: SG_TIMEZONE });
        if (!parsed.isValid) {
          throw new Error(`Invalid operational fact date: ${date}`);
        }
        return isoDate(parsed.startOf('day'));
      }),
    ),
  ].sort();
  if (normalizedDates.length === 0) {
    return [];
  }

  const dateTimes = normalizedDates.map((date) =>
    DateTime.fromISO(date, { zone: SG_TIMEZONE }),
  );
  const latestDate = dateTimes.reduce((latest, date) =>
    date > latest ? date : latest,
  );
  const dataset = await buildBaseDataset(latestDate.endOf('day'), db);
  const context = buildOperationalFactsRebuildContext(dataset);
  const database = db ?? (await getDefaultDb());
  const results: Array<{
    date: string;
    issueCount: number;
    lineCount: number;
  }> = [];

  for (const batch of chunk(dateTimes, OPERATIONAL_FACTS_REBUILD_DAY_BATCH)) {
    const rowsByDate = batch.map((date) =>
      buildOperationalFactRowsForDate(date, dataset, context),
    );
    await replaceOperationalFactRows(database, rowsByDate);
    results.push(
      ...rowsByDate.map((rows) => ({
        date: rows.date,
        issueCount: rows.issueRows.length,
        lineCount: rows.lineRows.length,
      })),
    );
  }

  return results;
}

export async function rebuildOperationalFactsRange(
  days: number,
  end = nowSg(),
  db?: AppDb,
) {
  const normalizedEnd = end.setZone(SG_TIMEZONE).startOf('day');
  const dataset = await buildBaseDataset(normalizedEnd.endOf('day'), db);
  const context = buildOperationalFactsRebuildContext(dataset);
  const database = db ?? (await getDefaultDb());
  const results: Array<{
    date: string;
    issueCount: number;
    lineCount: number;
  }> = [];

  const dates = Array.from({ length: days }, (_, index) =>
    normalizedEnd.minus({ days: days - 1 - index }),
  );
  for (const batch of chunk(dates, OPERATIONAL_FACTS_REBUILD_DAY_BATCH)) {
    const rowsByDate = batch.map((date) =>
      buildOperationalFactRowsForDate(date, dataset, context),
    );
    await replaceOperationalFactRows(database, rowsByDate);
    results.push(
      ...rowsByDate.map((rows) => ({
        date: rows.date,
        issueCount: rows.issueRows.length,
        lineCount: rows.lineRows.length,
      })),
    );
  }
  return results;
}
