import { asc, eq, inArray } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import {
  impactEventPeriodsTable,
  impactEventsTable,
  issuesTable,
  linesTable,
  operatorsTable,
  stationsTable,
} from '~/db/schema';
import { timeServerSpan } from '~/util/serverTiming';
import {
  getOperationalFactCoverageDatesInRange,
  getOperationalFactCoverageStart,
} from './operationalFacts';
import { getDefaultDb, selectByIdChunks, timeDbQuery } from './shared';
import { isoDate, nowSg, parseDateTime, SG_TIMEZONE } from './temporal';

type PeriodsSetEventRow = {
  id: string;
  issue_id: string;
  ts: string;
};

function selectLatestPeriodsSetEvents(rows: PeriodsSetEventRow[]) {
  const latestByIssueId = new Map<string, PeriodsSetEventRow>();
  for (const row of rows) {
    const current = latestByIssueId.get(row.issue_id);
    if (current == null) {
      latestByIssueId.set(row.issue_id, row);
      continue;
    }

    const tsDiff =
      parseDateTime(row.ts).toMillis() - parseDateTime(current.ts).toMillis();
    if (tsDiff > 0 || (tsDiff === 0 && row.id > current.id)) {
      latestByIssueId.set(row.issue_id, row);
    }
  }
  return latestByIssueId;
}

export async function getSitemapData() {
  const db = await getDefaultDb();
  return getSitemapDataFromDb(db);
}

export async function getSitemapDataFromDb(db: AppDb) {
  const [lineRows, stationRows, operatorRows, issueRows, periodsSetEventRows] =
    await timeServerSpan('sitemap_entity_queries', () =>
      Promise.all([
        timeDbQuery('sitemap_q_lines', () =>
          db
            .select({ id: linesTable.id })
            .from(linesTable)
            .orderBy(asc(linesTable.id)),
        ),
        timeDbQuery('sitemap_q_stations', () =>
          db
            .select({ id: stationsTable.id })
            .from(stationsTable)
            .orderBy(asc(stationsTable.id)),
        ),
        timeDbQuery('sitemap_q_operators', () =>
          db
            .select({ id: operatorsTable.id })
            .from(operatorsTable)
            .orderBy(asc(operatorsTable.id)),
        ),
        timeDbQuery('sitemap_q_issues', () =>
          db
            .select({ id: issuesTable.id })
            .from(issuesTable)
            .orderBy(asc(issuesTable.id)),
        ),
        timeDbQuery('sitemap_q_period_events', () =>
          db
            .select({
              id: impactEventsTable.id,
              issue_id: impactEventsTable.issue_id,
              ts: impactEventsTable.ts,
            })
            .from(impactEventsTable)
            .where(eq(impactEventsTable.type, 'periods.set')),
        ),
      ]),
    );

  const latestPeriodsSetEventByIssueId =
    selectLatestPeriodsSetEvents(periodsSetEventRows);
  const selectedPeriodEventIds = [
    ...new Set(
      issueRows
        .map((issue) => latestPeriodsSetEventByIssueId.get(issue.id)?.id)
        .filter((eventId): eventId is string => eventId != null),
    ),
  ];
  const periodRows = await timeDbQuery('sitemap_q_periods', () =>
    selectByIdChunks(selectedPeriodEventIds, (ids) =>
      db
        .select({
          impact_event_id: impactEventPeriodsTable.impact_event_id,
          index: impactEventPeriodsTable.index,
          start_at: impactEventPeriodsTable.start_at,
        })
        .from(impactEventPeriodsTable)
        .where(inArray(impactEventPeriodsTable.impact_event_id, ids)),
    ),
  );

  const periodRowsByImpactEventId = periodRows.reduce<
    Map<string, typeof periodRows>
  >((acc, row) => {
    const rows = acc.get(row.impact_event_id);
    if (rows == null) {
      acc.set(row.impact_event_id, [row]);
    } else {
      rows.push(row);
    }
    return acc;
  }, new Map());
  const skippedIssueIds: string[] = [];
  const issuesWithFirstDates = issueRows.flatMap((issue) => {
    const latestPeriodsSetEvent = latestPeriodsSetEventByIssueId.get(issue.id);
    if (latestPeriodsSetEvent == null) {
      return [];
    }

    const firstPeriod = [
      ...(periodRowsByImpactEventId.get(latestPeriodsSetEvent.id) ?? []),
    ].sort((a, b) => a.index - b.index)[0];
    if (firstPeriod == null) {
      return [];
    }

    const firstDate = parseDateTime(firstPeriod.start_at);
    if (!firstDate.isValid) {
      skippedIssueIds.push(issue.id);
      return [];
    }

    return [{ firstDate, issue }];
  });
  const firstDates = issuesWithFirstDates.map(({ firstDate }) => firstDate);
  const earliest = firstDates.sort((a, b) => a.toMillis() - b.toMillis())[0];
  const latest = firstDates.sort((a, b) => b.toMillis() - a.toMillis())[0];

  const monthEarliest =
    earliest != null ? isoDate(earliest.startOf('month')) : isoDate(nowSg());
  const monthLatest =
    latest != null ? isoDate(latest.startOf('month')) : isoDate(nowSg());
  const monthEarliestDateTime = DateTime.fromISO(monthEarliest, {
    zone: SG_TIMEZONE,
  });
  const monthLatestDateTime = DateTime.fromISO(monthLatest, {
    zone: SG_TIMEZONE,
  });
  const coverageRows = await getOperationalFactCoverageDatesInRange(
    monthEarliestDateTime,
    monthLatestDateTime.endOf('month'),
    db,
  );
  const operationalFactCoverageStart =
    await getOperationalFactCoverageStart(db);
  const operationalFactCoverageStartDate =
    operationalFactCoverageStart.status === 'available'
      ? operationalFactCoverageStart.startDate
      : null;

  if (skippedIssueIds.length > 0) {
    console.warn('[SITEMAP] Skipped issues with invalid first interval dates', {
      count: skippedIssueIds.length,
      issueIds: skippedIssueIds.slice(0, 20),
    });
  }

  return {
    lineIds: lineRows.map((row) => row.id),
    stationIds: stationRows.map((row) => row.id),
    operatorIds: operatorRows.map((row) => row.id),
    issueIds: issuesWithFirstDates.map(({ issue }) => issue.id),
    monthEarliest,
    monthLatest,
    operationalFactCoverageDates: coverageRows.map((row) => row.date),
    operationalFactCoverageMissing:
      operationalFactCoverageStart.status === 'missing_table',
    operationalFactCoverageStartDate,
    currentDate: isoDate(nowSg()),
  };
}
