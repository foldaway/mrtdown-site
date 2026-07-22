import { asc, desc, eq, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import { impactEventPeriodsTable, impactEventsTable } from '~/db/schema';
import { type AppDb, getDefaultDb, timeDbRowsQuery } from './database';
import { buildDataset } from './dataset';
import { isoDateTime, nowSg, parseDateTime } from './dateTime';
import { issueOverlapsRange } from './issueIntervals';

async function getIssueIdsOverlappingRange(
  rangeStart: DateTime,
  rangeEnd: DateTime,
  db?: AppDb,
) {
  const database = db ?? (await getDefaultDb());
  // Period events are revisions. Selecting the latest event before filtering
  // its periods preserves the canonical rule that a stale overlapping revision
  // must not include an issue whose newer revision no longer overlaps.
  const latestPeriodEvents = database.$with('latest_period_events').as(
    database
      .selectDistinctOn([impactEventsTable.issue_id], {
        id: impactEventsTable.id,
        issueId: impactEventsTable.issue_id,
      })
      .from(impactEventsTable)
      .where(eq(impactEventsTable.type, 'periods.set'))
      .orderBy(
        asc(impactEventsTable.issue_id),
        desc(impactEventsTable.ts),
        desc(impactEventsTable.id),
      ),
  );

  const issueRows = await timeDbRowsQuery(
    'issue_range_q_latest_overlapping_issue_ids',
    () =>
      database
        .with(latestPeriodEvents)
        .selectDistinct({ issueId: latestPeriodEvents.issueId })
        .from(latestPeriodEvents)
        .innerJoin(
          impactEventPeriodsTable,
          eq(impactEventPeriodsTable.impact_event_id, latestPeriodEvents.id),
        )
        .where(
          sql`${impactEventPeriodsTable.start_at} < ${isoDateTime(rangeEnd)} and (${impactEventPeriodsTable.end_at} is null or ${impactEventPeriodsTable.end_at} > ${isoDateTime(rangeStart)})`,
        )
        .orderBy(asc(latestPeriodEvents.issueId)),
  );
  return issueRows.map((row) => row.issueId);
}

type PeriodEventCandidate = Pick<
  typeof impactEventsTable.$inferSelect,
  'id' | 'issue_id' | 'ts'
>;

export function selectIssueIdsWithLatestOverlappingPeriodEvents(
  overlappingPeriodEventIds: Iterable<string>,
  periodEvents: readonly PeriodEventCandidate[],
) {
  const overlappingPeriodEventIdSet = new Set(overlappingPeriodEventIds);
  const latestPeriodEventByIssueId = periodEvents.reduce<
    Record<string, PeriodEventCandidate>
  >((acc, event) => {
    const current = acc[event.issue_id];
    if (current == null) {
      acc[event.issue_id] = event;
      return acc;
    }

    const tsDiff =
      parseDateTime(event.ts).toMillis() - parseDateTime(current.ts).toMillis();
    if (tsDiff > 0 || (tsDiff === 0 && event.id > current.id)) {
      acc[event.issue_id] = event;
    }
    return acc;
  }, {});

  return Object.values(latestPeriodEventByIssueId)
    .filter((event) => overlappingPeriodEventIdSet.has(event.id))
    .map((event) => event.issue_id)
    .sort();
}

export async function getIssuesOverlappingRange(
  rangeStart: DateTime,
  rangeEnd: DateTime,
  referenceNow = nowSg(),
  db?: AppDb,
) {
  const database = db ?? (await getDefaultDb());
  const issueIds = await getIssueIdsOverlappingRange(
    rangeStart,
    rangeEnd,
    database,
  );
  const dataset = await buildDataset(referenceNow, database, issueIds);
  const issues = Object.values(dataset.allIssues).filter((issue) =>
    issueOverlapsRange(issue, rangeStart, rangeEnd, referenceNow),
  );

  return { dataset, issues };
}
