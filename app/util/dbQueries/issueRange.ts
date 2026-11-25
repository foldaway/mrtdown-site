import { setResponseHeader } from '@tanstack/react-start/server';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { impactEventPeriodsTable, impactEventsTable } from '~/db/schema';
import { readRangeReferencesForSnapshot } from '~/util/rangeReferenceCache.server';
import { rangeSnapshotStore } from '~/util/rangeSnapshotStore.server';
import { recordServerTiming } from '~/util/serverTiming';
import { readServicePathsForSnapshot } from '~/util/servicePathCache.server';
import {
  type AppDb,
  type AppDbReader,
  getDefaultDb,
  timeDbRowsQuery,
} from './database';
import { assembleDataset, buildDataset } from './dataset';
import { isoDateTime, nowSg, parseDateTime } from './dateTime';
import { issueOverlapsRange } from './issueIntervals';
import {
  type RangeReferenceRows,
  readRangeReferenceRows,
} from './rangeReferences';
import { selectRangeSnapshotInputs } from './rangeSnapshotInputs';
import type { ServicePathRow } from './servicePaths';

async function getIssueIdsOverlappingRange(
  rangeStart: DateTime,
  rangeEnd: DateTime,
  database: Pick<AppDb, '$with' | 'selectDistinctOn' | 'with'>,
) {
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
  if (process.env.REDIS_URL) {
    const startedAt = performance.now();
    const snapshot = await rangeSnapshotStore.read();
    const source = snapshot?.source ?? 'sql';
    recordServerTiming(
      'range_snapshot_load',
      performance.now() - startedAt,
      source,
    );
    console.info(
      JSON.stringify({
        event: 'range_snapshot_read',
        source,
        redisBytes: snapshot?.redisBytes ?? 0,
      }),
    );
    try {
      if (process.env.TIER === 'staging')
        setResponseHeader('X-MRTDown-Range-Snapshot-Source', source);
    } catch {
      /* no request context */
    }
    if (snapshot) {
      const dataset = assembleDataset(
        referenceNow,
        selectRangeSnapshotInputs(
          snapshot.inputs,
          rangeStart.toMillis(),
          rangeEnd.toMillis(),
        ),
      );
      const issues = Object.values(dataset.allIssues).filter((issue) =>
        issueOverlapsRange(issue, rangeStart, rangeEnd, referenceNow),
      );
      return { dataset, issues };
    }
    // Keep recovery responses out of shared caches until publication is repaired.
    try {
      setResponseHeader('Cache-Control', 'no-store');
    } catch {
      /* no request context */
    }
  }
  const database = db ?? (await getDefaultDb());
  const read = async (
    reader: AppDbReader & Pick<AppDb, '$with' | 'selectDistinctOn' | 'with'>,
    paths?: readonly ServicePathRow[],
    references?: RangeReferenceRows,
  ) => {
    const issueIds = await getIssueIdsOverlappingRange(
      rangeStart,
      rangeEnd,
      reader,
    );
    const dataset = await buildDataset(
      referenceNow,
      reader,
      issueIds,
      undefined,
      {
        servicePaths: paths,
        references: references ?? (await readRangeReferenceRows(reader)),
      },
    );
    const issues = Object.values(dataset.allIssues).filter((issue) =>
      issueOverlapsRange(issue, rangeStart, rangeEnd, referenceNow),
    );
    return { dataset, issues };
  };
  if (!process.env.REDIS_URL) return read(database);

  return database.transaction(
    async (tx) => {
      const generation = await readCompletedPageProfileGeneration(tx);
      const range = {
        start: isoDateTime(rangeStart),
        end: isoDateTime(rangeEnd),
      };
      const [paths, references] = await Promise.all([
        readServicePathsForSnapshot(generation, range),
        readRangeReferencesForSnapshot(generation, range),
      ]);
      return read(tx, paths, references);
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

/** Earliest interval from current period revisions, excluding superseded dates. */
export async function getEarliestRecordedIssueDate(db?: AppDb) {
  const database = db ?? (await getDefaultDb());
  const latest = database.$with('earliest_latest_period_events').as(
    database
      .selectDistinctOn([impactEventsTable.issue_id], {
        id: impactEventsTable.id,
      })
      .from(impactEventsTable)
      .where(eq(impactEventsTable.type, 'periods.set'))
      .orderBy(
        asc(impactEventsTable.issue_id),
        desc(impactEventsTable.ts),
        desc(impactEventsTable.id),
      ),
  );
  const [row] = await database
    .with(latest)
    .select({
      earliest: sql<
        string | null
      >`min(${impactEventPeriodsTable.start_at})::text`,
    })
    .from(latest)
    .innerJoin(
      impactEventPeriodsTable,
      eq(impactEventPeriodsTable.impact_event_id, latest.id),
    );
  return row?.earliest ? parseDateTime(row.earliest).toISODate() : null;
}
