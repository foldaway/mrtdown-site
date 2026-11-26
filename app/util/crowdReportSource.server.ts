import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  crowdReportClusterLinesTable,
  crowdReportClustersTable,
  crowdReportClusterStationsTable,
  crowdReportLinesTable,
  crowdReportsTable,
  crowdReportStationsTable,
  linesTable,
  stationsTable,
} from '~/db/schema';
import { selectByIdChunks, type AppDbReader } from './dbQueries/database';
import type {
  CrowdReportSource,
  CrowdReportSourceKind,
  CrowdReportSourceStation,
} from './crowdReportSource';
import { getCrowdReportClusterDirection } from './crowdReportClustering';
type AppDb = AppDbReader;
type CrowdReportSourceStatus = CrowdReportSource['status'];

function toIsoString(value: Date | string | null) {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

// Publication reads the same projection in bounded batches, including historical sources.
const MAX_SOURCES = 10_000;
const MAX_MEMBERS = 100_000;
function groupRows<T extends { sourceId: string | null }>(rows: T[]) {
  const groups = new Map<string, Omit<T, 'sourceId'>[]>();
  for (const { sourceId, ...row } of rows) {
    if (sourceId == null) continue;
    const group = groups.get(sourceId) ?? [];
    group.push(row);
    groups.set(sourceId, group);
  }
  return groups;
}
async function getDirectionStations(
  db: AppDb,
  rows: { directionText: string | null }[],
  affected: CrowdReportSourceStation[],
) {
  const ids = [
    ...new Set(
      rows.flatMap(({ directionText }) =>
        directionText?.startsWith('towards:')
          ? [directionText.slice('towards:'.length)]
          : [],
      ),
    ),
  ];
  const known = affected.map(({ id, name }) => ({ id, name }));
  const missing = ids.filter((id) => !known.some((row) => row.id === id));
  if (!missing.length) return known;
  return [
    ...known,
    ...(await selectByIdChunks(missing, (batch) =>
      db
        .select({ id: stationsTable.id, name: stationsTable.name })
        .from(stationsTable)
        .where(inArray(stationsTable.id, batch)),
    )),
  ];
}
function resolveDirectionStation(
  directionText: string | null,
  affected: CrowdReportSourceStation[],
  destinations: CrowdReportSourceStation[],
) {
  if (!directionText?.startsWith('towards:')) return null;
  const id = directionText.slice('towards:'.length);
  return (
    affected.find((row) => row.id === id) ??
    destinations.find((row) => row.id === id) ??
    null
  );
}

function hasClusterScopeSql(
  clusterId: string | typeof crowdReportClustersTable.id,
) {
  return orSql(
    sql`exists (select 1 from ${crowdReportClusterLinesTable} where ${crowdReportClusterLinesTable.cluster_id} = ${clusterId})`,
    sql`exists (select 1 from ${crowdReportClusterStationsTable} where ${crowdReportClusterStationsTable.cluster_id} = ${clusterId})`,
  );
}

function hasReportScopeSql(reportId: string | typeof crowdReportsTable.id) {
  return orSql(
    sql`exists (select 1 from ${crowdReportLinesTable} where ${crowdReportLinesTable.report_id} = ${reportId})`,
    sql`exists (select 1 from ${crowdReportStationsTable} where ${crowdReportStationsTable.report_id} = ${reportId})`,
  );
}

function orSql(left: ReturnType<typeof sql>, right: ReturnType<typeof sql>) {
  return sql`(${left} or ${right})`;
}

async function getClusterSources(
  db: AppDb,
  sourceId?: string,
  limit = 1,
): Promise<CrowdReportSource[]> {
  const clusters = await db
    .select({
      id: crowdReportClustersTable.id,
      effect: crowdReportClustersTable.effect,
      status: crowdReportClustersTable.status,
      windowStartAt: crowdReportClustersTable.window_start_at,
      windowEndAt: crowdReportClustersTable.window_end_at,
      dispatchedAt: crowdReportClustersTable.dispatched_at,
      updatedAt: crowdReportClustersTable.updated_at,
    })
    .from(crowdReportClustersTable)
    .where(
      and(
        sourceId == null
          ? undefined
          : eq(crowdReportClustersTable.id, sourceId),
        inArray(crowdReportClustersTable.status, [
          'pending',
          'accepted',
          'dispatched',
        ]),
        hasClusterScopeSql(crowdReportClustersTable.id),
      ),
    )
    .limit(limit);

  if (!clusters.length) return [];
  if (clusters.length > MAX_SOURCES)
    throw Error('Too many public cluster sources');
  const ids = clusters.map(({ id }) => id);

  const [lines, stations, members] = await Promise.all([
    db
      .select({
        sourceId: crowdReportClusterLinesTable.cluster_id,
        id: linesTable.id,
        name: linesTable.name,
        color: linesTable.color,
      })
      .from(crowdReportClusterLinesTable)
      .innerJoin(
        linesTable,
        eq(crowdReportClusterLinesTable.line_id, linesTable.id),
      )
      .where(inArray(crowdReportClusterLinesTable.cluster_id, ids))
      .orderBy(asc(linesTable.id))
      .limit(sourceId == null ? MAX_MEMBERS + 1 : Number.MAX_SAFE_INTEGER),
    db
      .select({
        sourceId: crowdReportClusterStationsTable.cluster_id,
        id: stationsTable.id,
        name: stationsTable.name,
      })
      .from(crowdReportClusterStationsTable)
      .innerJoin(
        stationsTable,
        eq(crowdReportClusterStationsTable.station_id, stationsTable.id),
      )
      .where(inArray(crowdReportClusterStationsTable.cluster_id, ids))
      .orderBy(asc(stationsTable.id))
      .limit(sourceId == null ? MAX_MEMBERS + 1 : Number.MAX_SAFE_INTEGER),
    db
      .select({
        sourceId: crowdReportsTable.cluster_id,
        observedAt: crowdReportsTable.observed_at,
        directionText: crowdReportsTable.direction_text,
        delayMinutes: crowdReportsTable.delay_minutes,
        stillHappening: crowdReportsTable.still_happening,
      })
      .from(crowdReportsTable)
      .where(
        and(
          inArray(crowdReportsTable.cluster_id, ids),
          inArray(crowdReportsTable.status, [
            'accepted',
            'duplicate',
            'dispatched',
          ]),
          or(
            eq(crowdReportsTable.still_happening, true),
            ne(crowdReportsTable.producer, 'public'),
          ),
        ),
      )
      .orderBy(desc(crowdReportsTable.observed_at))
      .limit(sourceId == null ? MAX_MEMBERS + 1 : Number.MAX_SAFE_INTEGER),
  ]);

  if (sourceId == null && members.length > MAX_MEMBERS)
    throw Error('Too many public source members');
  if (
    sourceId == null &&
    (lines.length > MAX_MEMBERS || stations.length > MAX_MEMBERS)
  )
    throw Error('Too many public source references');
  const destinations = await getDirectionStations(db, members, stations);
  const byCluster = groupRows(members);
  const lineScopes = groupRows(lines);
  const stationScopes = groupRows(stations);
  return clusters.flatMap((cluster) => {
    const reports = byCluster.get(cluster.id) ?? [];
    if (!reports.length) return [];
    const affectedStations = stationScopes.get(cluster.id) ?? [];
    const representative = reports[0];
    const directionText = getCrowdReportClusterDirection(reports);
    const observedValues = reports.map((report) => report.observedAt);

    return {
      kind: 'cluster',
      id: cluster.id,
      status: cluster.status as CrowdReportSourceStatus,
      effect: cluster.effect,
      reportCount: reports.length,
      observedStartAt:
        observedValues.length > 0
          ? observedValues.reduce((earliest, value) =>
              value < earliest ? value : earliest,
            )
          : cluster.windowStartAt,
      observedEndAt:
        observedValues.length > 0
          ? observedValues.reduce((latest, value) =>
              value > latest ? value : latest,
            )
          : cluster.windowEndAt,
      updatedAt: toIsoString(cluster.updatedAt) ?? cluster.windowEndAt,
      dispatchedAt: toIsoString(cluster.dispatchedAt),
      directionText,
      directionStation: resolveDirectionStation(
        directionText,
        affectedStations,
        destinations,
      ),
      delayMinutes: representative?.delayMinutes ?? null,
      stillHappening: representative?.stillHappening ?? null,
      lines: lineScopes.get(cluster.id) ?? [],
      stations: affectedStations,
    } satisfies CrowdReportSource;
  });
}

async function getReportSources(
  db: AppDb,
  sourceId?: string,
  limit = 1,
): Promise<CrowdReportSource[]> {
  const reports = await db
    .select({
      id: crowdReportsTable.id,
      observedAt: crowdReportsTable.observed_at,
      directionText: crowdReportsTable.direction_text,
      effect: crowdReportsTable.effect,
      delayMinutes: crowdReportsTable.delay_minutes,
      stillHappening: crowdReportsTable.still_happening,
      status: crowdReportsTable.status,
      dispatchedAt: crowdReportsTable.dispatched_at,
      updatedAt: crowdReportsTable.updated_at,
    })
    .from(crowdReportsTable)
    .where(
      and(
        sourceId == null ? undefined : eq(crowdReportsTable.id, sourceId),
        inArray(crowdReportsTable.status, ['accepted', 'dispatched']),
        isNull(crowdReportsTable.cluster_id),
        hasReportScopeSql(crowdReportsTable.id),
      ),
    )
    .limit(limit);

  if (!reports.length) return [];
  if (reports.length > MAX_SOURCES)
    throw Error('Too many public report sources');
  const ids = reports.map(({ id }) => id);

  const [lines, stations] = await Promise.all([
    db
      .select({
        sourceId: crowdReportLinesTable.report_id,
        id: linesTable.id,
        name: linesTable.name,
        color: linesTable.color,
      })
      .from(crowdReportLinesTable)
      .innerJoin(linesTable, eq(crowdReportLinesTable.line_id, linesTable.id))
      .where(inArray(crowdReportLinesTable.report_id, ids))
      .orderBy(asc(linesTable.id))
      .limit(sourceId == null ? MAX_MEMBERS + 1 : Number.MAX_SAFE_INTEGER),
    db
      .select({
        sourceId: crowdReportStationsTable.report_id,
        id: stationsTable.id,
        name: stationsTable.name,
      })
      .from(crowdReportStationsTable)
      .innerJoin(
        stationsTable,
        eq(crowdReportStationsTable.station_id, stationsTable.id),
      )
      .where(inArray(crowdReportStationsTable.report_id, ids))
      .orderBy(asc(stationsTable.id))
      .limit(sourceId == null ? MAX_MEMBERS + 1 : Number.MAX_SAFE_INTEGER),
  ]);

  if (
    sourceId == null &&
    (lines.length > MAX_MEMBERS || stations.length > MAX_MEMBERS)
  )
    throw Error('Too many public source references');
  const destinations = await getDirectionStations(db, reports, stations);
  const lineScopes = groupRows(lines);
  const stationScopes = groupRows(stations);
  return reports.map((report) => ({
    kind: 'report',
    id: report.id,
    status: report.status as CrowdReportSourceStatus,
    effect: report.effect,
    reportCount: 1,
    observedStartAt: report.observedAt,
    observedEndAt: report.observedAt,
    updatedAt: toIsoString(report.updatedAt) ?? report.observedAt,
    dispatchedAt: toIsoString(report.dispatchedAt),
    directionText: report.directionText,
    directionStation: resolveDirectionStation(
      report.directionText,
      stationScopes.get(report.id) ?? [],
      destinations,
    ),
    delayMinutes: report.delayMinutes,
    stillHappening: report.stillHappening,
    lines: lineScopes.get(report.id) ?? [],
    stations: stationScopes.get(report.id) ?? [],
  }));
}

export async function getCrowdReportSource(
  db: AppDb,
  input: { kind: CrowdReportSourceKind; sourceId: string },
) {
  if (input.kind === 'cluster') {
    return (await getClusterSources(db, input.sourceId))[0] ?? null;
  }
  return (await getReportSources(db, input.sourceId))[0] ?? null;
}

export async function readPublicCrowdReportSources(db: AppDb) {
  const clusters = await getClusterSources(db, undefined, MAX_SOURCES + 1);
  const reports = await getReportSources(db, undefined, MAX_SOURCES + 1);
  if (clusters.length + reports.length > MAX_SOURCES)
    throw Error('Too many public sources');
  return [...clusters, ...reports];
}
