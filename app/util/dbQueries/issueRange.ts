import { setResponseHeader } from '@tanstack/react-start/server';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import { readCompletedPageProfileGeneration } from '~/db/pageProfileGeneration';
import { impactEventPeriodsTable, impactEventsTable } from '~/db/schema';
import { recordServerTiming } from '~/util/serverTiming';
import {
  isServicePathCacheEnabled,
  readCachedServicePaths,
} from '~/util/servicePathCache.server';
import {
  type AppDb,
  type AppDbReader,
  getDefaultDb,
  timeDbRowsQuery,
} from './database';
import { buildDataset } from './dataset';
import { isoDateTime, nowSg, parseDateTime } from './dateTime';
import { issueOverlapsRange } from './issueIntervals';

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
  const database = db ?? (await getDefaultDb());
  const read = async (
    reader: AppDbReader & Pick<AppDb, '$with' | 'selectDistinctOn' | 'with'>,
    paths?: Awaited<ReturnType<typeof readCachedServicePaths>>,
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
      paths?.rows,
    );
    const issues = Object.values(dataset.allIssues).filter((issue) =>
      issueOverlapsRange(issue, rangeStart, rangeEnd, referenceNow),
    );
    return { dataset, issues };
  };
  if (!isServicePathCacheEnabled()) return read(database);

  return database.transaction(
    async (tx) => {
      const startedAt = performance.now();
      const generation = await readCompletedPageProfileGeneration(tx);
      const paths = generation
        ? await readCachedServicePaths(generation)
        : null;
      const source = paths?.source ?? 'sql';
      recordServerTiming(
        'service_paths_load',
        performance.now() - startedAt,
        source,
      );
      recordServerTiming(
        'service_paths_redis_bytes',
        0,
        String(paths?.redisBytes ?? 0),
      );
      try {
        if (process.env.TIER === 'staging') {
          setResponseHeader('X-MRTDown-Service-Paths-Source', source);
        }
        if (!paths) setResponseHeader('Cache-Control', 'no-store');
      } catch {
        // Scripts and maintenance probes have no request context.
      }
      console.info(
        JSON.stringify({
          event: 'service_path_cache_read',
          source,
          redisBytes: paths?.redisBytes ?? 0,
          rangeStart: isoDateTime(rangeStart),
          rangeEnd: isoDateTime(rangeEnd),
        }),
      );
      return read(tx, paths);
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
