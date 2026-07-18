import { eq, sql } from 'drizzle-orm';
import { sitemapSnapshotsTable } from '~/db/schema';
import { timeServerSpan } from '~/util/serverTiming';
import { type AppDb, getDefaultDb, isUndefinedTableError } from './database';
import { type BaseDataset, buildCompleteDataset } from './dataset';
import { isoDate, isoDateTime, nowSg, parseDateTime } from './dateTime';

const SITEMAP_SNAPSHOT_ID = 'public';

export type SitemapData = {
  lineIds: string[];
  stationIds: string[];
  townIds: string[];
  operatorIds: string[];
  issueIds: string[];
  monthEarliest: string;
  monthLatest: string;
  currentDate: string;
};

type SitemapSnapshotPayload = {
  kind: 'sitemap_snapshot.v1';
  data: SitemapData;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

function isSitemapData(value: unknown): value is SitemapData {
  return (
    isRecord(value) &&
    isStringArray(value.lineIds) &&
    isStringArray(value.stationIds) &&
    isStringArray(value.townIds) &&
    isStringArray(value.operatorIds) &&
    isStringArray(value.issueIds) &&
    typeof value.monthEarliest === 'string' &&
    typeof value.monthLatest === 'string' &&
    typeof value.currentDate === 'string'
  );
}

export function parseSitemapSnapshotPayload(
  value: unknown,
): SitemapData | null {
  if (
    !isRecord(value) ||
    value.kind !== 'sitemap_snapshot.v1' ||
    !isSitemapData(value.data)
  ) {
    return null;
  }
  return value.data;
}

export function requireSitemapSnapshot(
  snapshot: SitemapData | null,
): SitemapData {
  if (snapshot == null) {
    throw new Error(
      'Sitemap snapshot is missing or invalid. Apply database migrations, then run the canonical data pull or POST /internal/api/tasks/facts before serving /sitemap.xml.',
    );
  }
  return snapshot;
}

type SitemapDataset = {
  included: {
    lines: Record<string, unknown>;
    stations: Record<string, unknown>;
    towns: Record<string, unknown>;
    operators: Record<string, unknown>;
  };
  allIssues: BaseDataset['allIssues'];
};

export function buildSitemapDataFromDataset(
  dataset: SitemapDataset,
): SitemapData {
  const skippedIssueIds: string[] = [];
  const issuesWithFirstDates = Object.values(dataset.allIssues).flatMap(
    (issue) => {
      const firstInterval = issue.intervals[0];
      if (firstInterval == null) {
        return [];
      }

      const firstDate = parseDateTime(firstInterval.startAt);
      if (!firstDate.isValid) {
        skippedIssueIds.push(issue.id);
        return [];
      }

      return [{ firstDate, issue }];
    },
  );
  const firstDates = issuesWithFirstDates.map(({ firstDate }) => firstDate);
  const earliest = firstDates.sort((a, b) => a.toMillis() - b.toMillis())[0];
  const latest = firstDates.sort((a, b) => b.toMillis() - a.toMillis())[0];

  const monthEarliest =
    earliest != null ? isoDate(earliest.startOf('month')) : isoDate(nowSg());
  const monthLatest =
    latest != null ? isoDate(latest.startOf('month')) : isoDate(nowSg());
  if (skippedIssueIds.length > 0) {
    console.warn('[SITEMAP] Skipped issues with invalid first interval dates', {
      count: skippedIssueIds.length,
      issueIds: skippedIssueIds.slice(0, 20),
    });
  }

  return {
    lineIds: Object.keys(dataset.included.lines).sort(),
    stationIds: Object.keys(dataset.included.stations).sort(),
    townIds: Object.keys(dataset.included.towns).sort(),
    operatorIds: Object.keys(dataset.included.operators).sort(),
    issueIds: issuesWithFirstDates.map(({ issue }) => issue.id),
    monthEarliest,
    monthLatest,
    currentDate: isoDate(nowSg()),
  };
}

async function getLatestSitemapSnapshot(db?: AppDb) {
  const database = db ?? (await getDefaultDb());
  try {
    const [snapshot] = await timeServerSpan('sitemap_snapshot_query', () =>
      database
        .select({ data: sitemapSnapshotsTable.data })
        .from(sitemapSnapshotsTable)
        .where(eq(sitemapSnapshotsTable.id, SITEMAP_SNAPSHOT_ID))
        .limit(1),
    );
    return parseSitemapSnapshotPayload(snapshot?.data);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function rebuildSitemapSnapshot(db?: AppDb) {
  return timeServerSpan('sitemap_snapshot_rebuild', async () => {
    const database = db ?? (await getDefaultDb());
    const asOf = isoDateTime(nowSg());
    const dataset = await buildCompleteDataset(
      'workflow:sitemap-snapshot',
      nowSg(),
      database,
    );
    const data = buildSitemapDataFromDataset(dataset);
    const snapshotPayload = {
      kind: 'sitemap_snapshot.v1',
      data,
    } satisfies SitemapSnapshotPayload;

    await timeServerSpan('sitemap_snapshot_upsert', () =>
      database
        .insert(sitemapSnapshotsTable)
        .values({
          id: SITEMAP_SNAPSHOT_ID,
          as_of: asOf,
          data: snapshotPayload,
        })
        .onConflictDoUpdate({
          target: [sitemapSnapshotsTable.id],
          set: {
            as_of: asOf,
            data: snapshotPayload,
            updated_at: sql`now()`,
          },
        }),
    );

    return {
      asOf,
      pathEntityCount:
        data.lineIds.length +
        data.stationIds.length +
        data.townIds.length +
        data.operatorIds.length +
        data.issueIds.length,
    };
  });
}

export async function getSitemapData() {
  return timeServerSpan('sitemap_data', async () => {
    const snapshot = requireSitemapSnapshot(await getLatestSitemapSnapshot());
    return {
      ...snapshot,
      currentDate: isoDate(nowSg()),
    };
  });
}
