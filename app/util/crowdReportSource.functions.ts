import type { Translations } from '@mrtdown/core';
import { createServerFn } from '@tanstack/react-start';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type AppDb, getDb } from '~/db';
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
import type { CrowdReportEffect } from './crowdReports';

const CrowdReportSourceKindSchema = z.enum(['cluster', 'report']);

const RequestSchema = z.object({
  kind: CrowdReportSourceKindSchema,
  sourceId: z.string().trim().min(1).max(128),
});

type CrowdReportSourceKind = z.infer<typeof CrowdReportSourceKindSchema>;
type CrowdReportSourceStatus = 'accepted' | 'dispatched';

export type CrowdReportSourceLine = {
  id: string;
  name: Translations;
  color: string;
};

export type CrowdReportSourceStation = {
  id: string;
  name: Translations;
};

export type CrowdReportSource = {
  kind: CrowdReportSourceKind;
  id: string;
  status: CrowdReportSourceStatus;
  effect: CrowdReportEffect | null;
  reportCount: number;
  observedStartAt: string;
  observedEndAt: string;
  updatedAt: string;
  dispatchedAt: string | null;
  directionText: string | null;
  delayMinutes: number | null;
  stillHappening: boolean | null;
  lines: CrowdReportSourceLine[];
  stations: CrowdReportSourceStation[];
};

function toIsoString(value: Date | string | null) {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function hasClusterScopeSql(clusterId: string) {
  return orSql(
    sql`exists (select 1 from ${crowdReportClusterLinesTable} where ${crowdReportClusterLinesTable.cluster_id} = ${clusterId})`,
    sql`exists (select 1 from ${crowdReportClusterStationsTable} where ${crowdReportClusterStationsTable.cluster_id} = ${clusterId})`,
  );
}

function hasReportScopeSql(reportId: string) {
  return orSql(
    sql`exists (select 1 from ${crowdReportLinesTable} where ${crowdReportLinesTable.report_id} = ${reportId})`,
    sql`exists (select 1 from ${crowdReportStationsTable} where ${crowdReportStationsTable.report_id} = ${reportId})`,
  );
}

function orSql(left: ReturnType<typeof sql>, right: ReturnType<typeof sql>) {
  return sql`(${left} or ${right})`;
}

async function getClusterSource(
  db: AppDb,
  sourceId: string,
): Promise<CrowdReportSource | null> {
  const [cluster] = await db
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
        eq(crowdReportClustersTable.id, sourceId),
        inArray(crowdReportClustersTable.status, ['accepted', 'dispatched']),
        hasClusterScopeSql(sourceId),
      ),
    )
    .limit(1);

  if (cluster == null) {
    return null;
  }

  const [lines, stations, reports] = await Promise.all([
    db
      .select({
        id: linesTable.id,
        name: linesTable.name,
        color: linesTable.color,
      })
      .from(crowdReportClusterLinesTable)
      .innerJoin(
        linesTable,
        eq(crowdReportClusterLinesTable.line_id, linesTable.id),
      )
      .where(eq(crowdReportClusterLinesTable.cluster_id, cluster.id))
      .orderBy(asc(linesTable.id)),
    db
      .select({
        id: stationsTable.id,
        name: stationsTable.name,
      })
      .from(crowdReportClusterStationsTable)
      .innerJoin(
        stationsTable,
        eq(crowdReportClusterStationsTable.station_id, stationsTable.id),
      )
      .where(eq(crowdReportClusterStationsTable.cluster_id, cluster.id))
      .orderBy(asc(stationsTable.id)),
    db
      .select({
        observedAt: crowdReportsTable.observed_at,
        directionText: crowdReportsTable.direction_text,
        delayMinutes: crowdReportsTable.delay_minutes,
        stillHappening: crowdReportsTable.still_happening,
      })
      .from(crowdReportsTable)
      .where(
        and(
          eq(crowdReportsTable.cluster_id, cluster.id),
          inArray(crowdReportsTable.status, [
            'accepted',
            'duplicate',
            'dispatched',
          ]),
          eq(crowdReportsTable.still_happening, true),
        ),
      )
      .orderBy(desc(crowdReportsTable.observed_at)),
  ]);

  if (reports.length === 0) {
    return null;
  }

  const representative = reports[0];
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
    directionText: representative?.directionText ?? null,
    delayMinutes: representative?.delayMinutes ?? null,
    stillHappening: representative?.stillHappening ?? null,
    lines,
    stations,
  };
}

async function getReportSource(
  db: AppDb,
  sourceId: string,
): Promise<CrowdReportSource | null> {
  const [report] = await db
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
        eq(crowdReportsTable.id, sourceId),
        inArray(crowdReportsTable.status, ['accepted', 'dispatched']),
        isNull(crowdReportsTable.cluster_id),
        hasReportScopeSql(sourceId),
      ),
    )
    .limit(1);

  if (report == null) {
    return null;
  }

  const [lines, stations] = await Promise.all([
    db
      .select({
        id: linesTable.id,
        name: linesTable.name,
        color: linesTable.color,
      })
      .from(crowdReportLinesTable)
      .innerJoin(linesTable, eq(crowdReportLinesTable.line_id, linesTable.id))
      .where(eq(crowdReportLinesTable.report_id, report.id))
      .orderBy(asc(linesTable.id)),
    db
      .select({
        id: stationsTable.id,
        name: stationsTable.name,
      })
      .from(crowdReportStationsTable)
      .innerJoin(
        stationsTable,
        eq(crowdReportStationsTable.station_id, stationsTable.id),
      )
      .where(eq(crowdReportStationsTable.report_id, report.id))
      .orderBy(asc(stationsTable.id)),
  ]);

  return {
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
    delayMinutes: report.delayMinutes,
    stillHappening: report.stillHappening,
    lines,
    stations,
  };
}

export async function getCrowdReportSource(
  db: AppDb,
  input: z.infer<typeof RequestSchema>,
) {
  if (input.kind === 'cluster') {
    return getClusterSource(db, input.sourceId);
  }
  return getReportSource(db, input.sourceId);
}

export const getCrowdReportSourceFn = createServerFn({
  method: 'GET',
})
  .inputValidator((value) => RequestSchema.parse(value))
  .handler(async ({ data }) => {
    const source = await getCrowdReportSource(getDb(), data);
    if (source == null) {
      throw new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      });
    }
    return source;
  });
