import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import { impactEventPeriodsTable, impactEventsTable } from '~/db/schema';
import {
  type AppDb,
  getDefaultDb,
  selectByIdChunks,
  timeDbQuery,
} from './database';
import { buildDataset } from './dataset';
import { isoDateTime, nowSg, parseDateTime } from './dateTime';
import { issueOverlapsRange } from './issueIntervals';

async function getIssueIdsOverlappingRange(
  rangeStart: DateTime,
  rangeEnd: DateTime,
  db?: AppDb,
) {
  const database = db ?? (await getDefaultDb());
  const overlappingPeriodRows = await timeDbQuery(
    'issue_range_q_overlapping_periods',
    () =>
      database
        .select({
          impact_event_id: impactEventPeriodsTable.impact_event_id,
        })
        .from(impactEventPeriodsTable)
        .where(
          sql`${impactEventPeriodsTable.start_at} < ${isoDateTime(rangeEnd)} and (${impactEventPeriodsTable.end_at} is null or ${impactEventPeriodsTable.end_at} > ${isoDateTime(rangeStart)})`,
        ),
  );
  const overlappingPeriodEventIds = [
    ...new Set(overlappingPeriodRows.map((row) => row.impact_event_id)),
  ];
  const overlappingPeriodEventRows = await timeDbQuery(
    'issue_range_q_period_events_for_overlap',
    () =>
      selectByIdChunks(overlappingPeriodEventIds, (ids) =>
        database
          .select({
            id: impactEventsTable.id,
            issue_id: impactEventsTable.issue_id,
            ts: impactEventsTable.ts,
          })
          .from(impactEventsTable)
          .where(inArray(impactEventsTable.id, ids)),
      ),
  );
  const candidateIssueIds = [
    ...new Set(overlappingPeriodEventRows.map((event) => event.issue_id)),
  ];
  const periodEventRows = await timeDbQuery(
    'issue_range_q_period_events_for_issues',
    () =>
      selectByIdChunks(candidateIssueIds, (ids) =>
        database
          .select({
            id: impactEventsTable.id,
            issue_id: impactEventsTable.issue_id,
            ts: impactEventsTable.ts,
          })
          .from(impactEventsTable)
          .where(
            and(
              eq(impactEventsTable.type, 'periods.set'),
              inArray(impactEventsTable.issue_id, ids),
            ),
          ),
      ),
  );
  return selectIssueIdsWithLatestOverlappingPeriodEvents(
    overlappingPeriodEventIds,
    periodEventRows,
  );
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
