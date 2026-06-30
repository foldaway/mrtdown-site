import {
  IngestContentCrowdReportSource,
  IngestPayloadSchema,
  type IngestContentCrowdReport,
  type IngestPayload,
} from '@mrtdown/ingest-contracts';
import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import {
  type AppDbStatementRunner,
  runDbOrderedStatements,
} from '~/db/orderedStatements';
import {
  crowdReportAbuseEventsTable,
  crowdReportClusterLinesTable,
  crowdReportClustersTable,
  crowdReportClusterStationsTable,
  crowdReportLinesTable,
  crowdReportsTable,
  crowdReportStationsTable,
} from '~/db/schema';

const DEFAULT_DISPATCH_OWNER = 'foldaway';
const DEFAULT_DISPATCH_REPO = 'mrtdown-data';
const DEFAULT_DISPATCH_EVENT_TYPE = 'ingest';
const DEFAULT_DISPATCH_LIMIT = 10;
const DEFAULT_DISPATCH_TIMEOUT_MS = 15_000;
const DEFAULT_DISPATCH_MIN_ONGOING_REPORTS = 3;
const DEFAULT_DISPATCH_MIN_DISTINCT_IP_HASHES = 2;
const MAX_DISPATCH_LIMIT = 50;
const D1_REPORT_UPDATE_BATCH = 90;
const DISPATCH_LOCK_STALE_AFTER_MS = 10 * 60 * 1000;
const DISPATCH_LOCK_ERROR = 'Dispatch in progress';
const STALE_DISPATCH_SUCCESS_ERROR =
  'Crowd report dispatch was sent, but local success marking became stale';

type CrowdReportTransaction = AppDbStatementRunner;
type LockableCrowdReportDispatchCandidate = CrowdReportDispatchCandidate & {
  dispatchLockAt?: string;
};

export type CrowdReportDispatchKind = 'cluster' | 'report';

export type CrowdReportDispatchCandidate = {
  kind: CrowdReportDispatchKind;
  id: string;
  reportIds: string[];
  payload: IngestPayload;
  dispatchLockAt?: string;
};

export type CrowdReportDispatchConfig = {
  token: string;
  owner?: string;
  repo?: string;
  eventType?: string;
  timeoutMs?: number;
};

export type CrowdReportDispatchResponse = {
  status: number;
  responseText: string;
};

export type CrowdReportDispatchRunResult = {
  success: boolean;
  count: number;
  dispatched: number;
  failed: number;
  results: Array<{
    kind: CrowdReportDispatchKind;
    id: string;
    success: boolean;
    status?: number;
    error?: string;
    skipped?: boolean;
  }>;
};

type CrowdReportDispatchOptions = {
  candidates?: CrowdReportDispatchCandidate[];
  limit?: number;
  kind?: CrowdReportDispatchKind | 'any';
  rootUrl: string;
};

type ReportContentInput = {
  id: string;
  kind: CrowdReportDispatchKind;
  reportIds: string[];
  createdAt: string | Date;
  observedAt: string | Date;
  lineIds: string[];
  stationIds: string[];
  directionText: string | null;
  effect: IngestContentCrowdReport['effect'] | null;
  delayMinutes: number | null;
  reportCount: number;
  isStillHappening?: boolean | null;
  rootUrl: string;
};

function clampDispatchLimit(limit: number | undefined) {
  if (limit == null) {
    return DEFAULT_DISPATCH_LIMIT;
  }
  return Math.max(1, Math.min(MAX_DISPATCH_LIMIT, limit));
}

function normalizeTimestamp(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getDispatchLockNow() {
  return DateTime.now().toUTC().toISO() ?? new Date().toISOString();
}

function getDispatchLockStaleBefore(now = getDispatchLockNow()) {
  const parsed = DateTime.fromISO(now);
  const base = parsed.isValid ? parsed : DateTime.utc();
  return (
    base
      .minus({ milliseconds: DISPATCH_LOCK_STALE_AFTER_MS })
      .toUTC()
      .toISO() ??
    new Date(Date.now() - DISPATCH_LOCK_STALE_AFTER_MS).toISOString()
  );
}

function canAcquireCrowdReportDispatchLockSql(staleBefore: string) {
  return or(
    isNull(crowdReportsTable.dispatch_error),
    ne(crowdReportsTable.dispatch_error, DISPATCH_LOCK_ERROR),
    lte(crowdReportsTable.updated_at, staleBefore),
  );
}

function canAcquireCrowdReportClusterDispatchLockSql(staleBefore: string) {
  return or(
    isNull(crowdReportClustersTable.dispatched_at),
    lte(crowdReportClustersTable.updated_at, staleBefore),
  );
}

function hasNoActiveCrowdReportDispatchLocksSql(staleBefore: string) {
  return sql`not exists (
    select 1
    from ${crowdReportsTable}
    where ${crowdReportsTable.cluster_id} = ${crowdReportClustersTable.id}
      and ${crowdReportsTable.dispatch_error} = ${DISPATCH_LOCK_ERROR}
      and ${crowdReportsTable.updated_at} > ${staleBefore}
  )`;
}

function hasCrowdReportClusterScope() {
  return or(
    sql`exists (select 1 from ${crowdReportClusterLinesTable} where ${crowdReportClusterLinesTable.cluster_id} = ${crowdReportClustersTable.id})`,
    sql`exists (select 1 from ${crowdReportClusterStationsTable} where ${crowdReportClusterStationsTable.cluster_id} = ${crowdReportClustersTable.id})`,
  );
}

function hasCrowdReportScope() {
  return or(
    sql`exists (select 1 from ${crowdReportLinesTable} where ${crowdReportLinesTable.report_id} = ${crowdReportsTable.id})`,
    sql`exists (select 1 from ${crowdReportStationsTable} where ${crowdReportStationsTable.report_id} = ${crowdReportsTable.id})`,
  );
}

function hasCrowdReportClusterCurrentConfidence() {
  return sql`${getCrowdReportClusterOngoingReportCountSql()} >= ${DEFAULT_DISPATCH_MIN_ONGOING_REPORTS} and ${getCrowdReportClusterOngoingDistinctIpHashCountSql()} >= ${DEFAULT_DISPATCH_MIN_DISTINCT_IP_HASHES}`;
}

function getCrowdReportClusterOngoingReportCountSql() {
  return sql<number>`(
    select count(*)
    from ${crowdReportsTable}
    where ${crowdReportsTable.cluster_id} = ${crowdReportClustersTable.id}
      and ${crowdReportsTable.status} in ('accepted', 'duplicate')
      and ${crowdReportsTable.still_happening} is true
  )`;
}

function getCrowdReportClusterOngoingDistinctIpHashCountSql() {
  return sql<number>`(
    select count(distinct ${crowdReportAbuseEventsTable.ip_hash})
    from ${crowdReportAbuseEventsTable}
    inner join ${crowdReportsTable}
      on ${crowdReportsTable.id} = ${crowdReportAbuseEventsTable.report_id}
    where ${crowdReportsTable.cluster_id} = ${crowdReportClustersTable.id}
      and ${crowdReportsTable.status} in ('accepted', 'duplicate')
      and ${crowdReportsTable.still_happening} is true
  )`;
}

export function buildCrowdReportSourceUrl(
  rootUrl: string,
  kind: CrowdReportDispatchKind,
  id: string,
) {
  const url = new URL(
    `/community-reports/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
    rootUrl,
  );
  return url.toString();
}

export function buildCrowdReportDispatchText(
  input: Pick<
    ReportContentInput,
    | 'delayMinutes'
    | 'directionText'
    | 'effect'
    | 'isStillHappening'
    | 'lineIds'
    | 'reportCount'
    | 'stationIds'
  >,
) {
  const contextParts = [
    input.lineIds.length > 0 ? `lines ${input.lineIds.join(', ')}` : undefined,
    input.stationIds.length > 0
      ? `stations ${input.stationIds.join(', ')}`
      : undefined,
  ].filter((part): part is string => part != null);

  const summary: string[] = [];
  if (input.reportCount && input.reportCount > 1) {
    summary.push(`${input.reportCount} community reports describe this issue.`);
  } else {
    summary.push('A community report describes this issue.');
  }
  if (input.effect) {
    summary.push(`Reported effect: ${input.effect}.`);
  }
  if (contextParts.length > 0) {
    summary.push(`Affected ${contextParts.join('; ')}.`);
  }
  if (input.directionText) {
    summary.push(`Direction: ${input.directionText}.`);
  }
  if (input.delayMinutes != null) {
    summary.push(`Reported delay: ${input.delayMinutes} minutes.`);
  }
  if (input.isStillHappening != null) {
    summary.push(
      input.isStillHappening
        ? 'The reporter said this was still happening.'
        : 'The reporter said this was no longer happening.',
    );
  }

  summary.push('Reporter notes are not collected.');
  return summary.join(' ');
}

export function buildCrowdReportIngestPayload(
  input: ReportContentInput,
): CrowdReportDispatchCandidate {
  const content: IngestContentCrowdReport = {
    source: IngestContentCrowdReportSource,
    reportId: `${input.kind}:${input.id}`,
    text: buildCrowdReportDispatchText(input),
    createdAt: normalizeTimestamp(input.createdAt),
    observedAt: normalizeTimestamp(input.observedAt),
    lineIds: input.lineIds.length > 0 ? input.lineIds : undefined,
    stationIds: input.stationIds.length > 0 ? input.stationIds : undefined,
    directionText: input.directionText ?? undefined,
    effect: input.effect ?? undefined,
    delayMinutes: input.delayMinutes ?? undefined,
    reportCount: input.reportCount,
    url: buildCrowdReportSourceUrl(input.rootUrl, input.kind, input.id),
  };
  const payload = IngestPayloadSchema.parse({ content: [content] });
  return {
    kind: input.kind,
    id: input.id,
    reportIds: input.reportIds,
    payload,
  };
}

export async function getDispatchableCrowdReportCandidates(
  db: AppDb,
  options: CrowdReportDispatchOptions,
): Promise<CrowdReportDispatchCandidate[]> {
  const limit = clampDispatchLimit(options.limit);
  const candidates: CrowdReportDispatchCandidate[] = [];

  if (options.kind !== 'report') {
    candidates.push(
      ...(await getDispatchableCrowdReportClusterCandidates(db, {
        limit,
        rootUrl: options.rootUrl,
      })),
    );
  }

  if (options.kind !== 'cluster' && candidates.length < limit) {
    candidates.push(
      ...(await getDispatchableSingleCrowdReportCandidates(db, {
        limit: limit - candidates.length,
        rootUrl: options.rootUrl,
      })),
    );
  }

  return candidates;
}

async function getDispatchableCrowdReportClusterCandidates(
  db: AppDb,
  options: { limit: number; rootUrl: string },
) {
  const staleBefore = getDispatchLockStaleBefore();
  const clusterRows = await db
    .select({
      id: crowdReportClustersTable.id,
      effect: crowdReportClustersTable.effect,
      reportCount: getCrowdReportClusterOngoingReportCountSql(),
      windowEndAt: crowdReportClustersTable.window_end_at,
      updatedAt: crowdReportClustersTable.updated_at,
    })
    .from(crowdReportClustersTable)
    .where(
      and(
        eq(crowdReportClustersTable.status, 'accepted'),
        canAcquireCrowdReportClusterDispatchLockSql(staleBefore),
        hasNoActiveCrowdReportDispatchLocksSql(staleBefore),
        hasCrowdReportClusterScope(),
        hasCrowdReportClusterCurrentConfidence(),
      ),
    )
    .orderBy(desc(crowdReportClustersTable.window_end_at))
    .limit(options.limit);

  const clusterIds = clusterRows.map((cluster) => cluster.id);
  if (clusterIds.length === 0) {
    return [];
  }

  const [lineRows, stationRows, reportRows] = await Promise.all([
    db
      .select({
        clusterId: crowdReportClusterLinesTable.cluster_id,
        lineId: crowdReportClusterLinesTable.line_id,
      })
      .from(crowdReportClusterLinesTable)
      .where(inArray(crowdReportClusterLinesTable.cluster_id, clusterIds)),
    db
      .select({
        clusterId: crowdReportClusterStationsTable.cluster_id,
        stationId: crowdReportClusterStationsTable.station_id,
      })
      .from(crowdReportClusterStationsTable)
      .where(inArray(crowdReportClusterStationsTable.cluster_id, clusterIds)),
    db
      .select({
        id: crowdReportsTable.id,
        clusterId: crowdReportsTable.cluster_id,
        observedAt: crowdReportsTable.observed_at,
        directionText: crowdReportsTable.direction_text,
        delayMinutes: crowdReportsTable.delay_minutes,
        stillHappening: crowdReportsTable.still_happening,
      })
      .from(crowdReportsTable)
      .where(
        and(
          inArray(crowdReportsTable.cluster_id, clusterIds),
          inArray(crowdReportsTable.status, ['accepted', 'duplicate']),
          eq(crowdReportsTable.still_happening, true),
        ),
      )
      .orderBy(desc(crowdReportsTable.observed_at)),
  ]);

  return clusterRows.flatMap((cluster) => {
    const lineIds = lineRows
      .filter((row) => row.clusterId === cluster.id)
      .map((row) => row.lineId)
      .sort((a, b) => a.localeCompare(b));
    const stationIds = stationRows
      .filter((row) => row.clusterId === cluster.id)
      .map((row) => row.stationId)
      .sort((a, b) => a.localeCompare(b));
    const reports = reportRows.filter((row) => row.clusterId === cluster.id);
    const representative = reports[0];
    if (
      representative == null ||
      (lineIds.length === 0 && stationIds.length === 0)
    ) {
      return [];
    }

    const observedAt = reports.reduce(
      (earliest, report) =>
        report.observedAt < earliest ? report.observedAt : earliest,
      representative.observedAt,
    );

    return [
      buildCrowdReportIngestPayload({
        kind: 'cluster',
        id: cluster.id,
        reportIds: reports.map((report) => report.id),
        createdAt: cluster.updatedAt,
        observedAt,
        lineIds,
        stationIds,
        directionText: representative.directionText,
        effect: cluster.effect,
        delayMinutes: representative.delayMinutes,
        reportCount: cluster.reportCount,
        isStillHappening: representative.stillHappening,
        rootUrl: options.rootUrl,
      }),
    ];
  });
}

async function getDispatchableSingleCrowdReportCandidates(
  db: AppDb,
  options: { limit: number; rootUrl: string },
) {
  if (options.limit <= 0) {
    return [];
  }

  const staleBefore = getDispatchLockStaleBefore();
  const reportRows = await db
    .select({
      id: crowdReportsTable.id,
      observedAt: crowdReportsTable.observed_at,
      directionText: crowdReportsTable.direction_text,
      effect: crowdReportsTable.effect,
      delayMinutes: crowdReportsTable.delay_minutes,
      stillHappening: crowdReportsTable.still_happening,
      updatedAt: crowdReportsTable.updated_at,
    })
    .from(crowdReportsTable)
    .where(
      and(
        eq(crowdReportsTable.status, 'accepted'),
        isNull(crowdReportsTable.dispatched_at),
        isNull(crowdReportsTable.cluster_id),
        canAcquireCrowdReportDispatchLockSql(staleBefore),
        hasCrowdReportScope(),
      ),
    )
    .orderBy(desc(crowdReportsTable.observed_at))
    .limit(options.limit);

  const reportIds = reportRows.map((report) => report.id);
  if (reportIds.length === 0) {
    return [];
  }

  const [lineRows, stationRows] = await Promise.all([
    db
      .select({
        reportId: crowdReportLinesTable.report_id,
        lineId: crowdReportLinesTable.line_id,
      })
      .from(crowdReportLinesTable)
      .where(inArray(crowdReportLinesTable.report_id, reportIds)),
    db
      .select({
        reportId: crowdReportStationsTable.report_id,
        stationId: crowdReportStationsTable.station_id,
      })
      .from(crowdReportStationsTable)
      .where(inArray(crowdReportStationsTable.report_id, reportIds)),
  ]);

  return reportRows.flatMap((report) => {
    const lineIds = lineRows
      .filter((row) => row.reportId === report.id)
      .map((row) => row.lineId)
      .sort((a, b) => a.localeCompare(b));
    const stationIds = stationRows
      .filter((row) => row.reportId === report.id)
      .map((row) => row.stationId)
      .sort((a, b) => a.localeCompare(b));
    if (lineIds.length === 0 && stationIds.length === 0) {
      return [];
    }

    return [
      buildCrowdReportIngestPayload({
        kind: 'report',
        id: report.id,
        reportIds: [report.id],
        createdAt: report.updatedAt,
        observedAt: report.observedAt,
        lineIds,
        stationIds,
        directionText: report.directionText,
        effect: report.effect,
        delayMinutes: report.delayMinutes,
        reportCount: 1,
        isStillHappening: report.stillHappening,
        rootUrl: options.rootUrl,
      }),
    ];
  });
}

export async function dispatchCrowdReportPayloadToGitHub(
  payload: IngestPayload,
  config: CrowdReportDispatchConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CrowdReportDispatchResponse> {
  const owner = config.owner?.trim() || DEFAULT_DISPATCH_OWNER;
  const repo = config.repo?.trim() || DEFAULT_DISPATCH_REPO;
  const eventType = config.eventType?.trim() || DEFAULT_DISPATCH_EVENT_TYPE;
  const timeoutMs = config.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'mrtdown-site-crowd-report-dispatch',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          event_type: eventType,
          client_payload: payload,
        }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `GitHub repository_dispatch timed out after ${timeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `GitHub repository_dispatch failed with ${response.status}: ${responseText.slice(
        0,
        500,
      )}`,
    );
  }

  return { status: response.status, responseText };
}

export async function markCrowdReportDispatchSuccess(
  db: AppDb,
  candidate: CrowdReportDispatchCandidate,
  dispatchedAt = DateTime.now().toUTC().toISO() ?? new Date().toISOString(),
) {
  return runDbOrderedStatements(db, (tx) =>
    markCrowdReportDispatchSuccessInTransaction(tx, candidate, dispatchedAt),
  );
}

export async function markCrowdReportDispatchFailure(
  db: AppDb,
  candidate: CrowdReportDispatchCandidate,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  await runDbOrderedStatements(db, (tx) =>
    markCrowdReportDispatchFailureInTransaction(tx, candidate, message),
  );
}

async function markCrowdReportDispatchSuccessInTransaction(
  tx: CrowdReportTransaction,
  candidate: LockableCrowdReportDispatchCandidate,
  dispatchedAt: string,
) {
  const updatedAt = DateTime.fromISO(dispatchedAt).isValid
    ? (DateTime.fromISO(dispatchedAt).toUTC().toISO() ?? dispatchedAt)
    : new Date().toISOString();
  if (candidate.kind === 'cluster') {
    if (!(await isCrowdReportClusterDispatchPayloadCurrent(tx, candidate))) {
      return false;
    }
  } else if (!(await isCrowdReportDispatchCandidateEligible(tx, candidate))) {
    return false;
  }

  const updatedReports = await updateCrowdReportDispatchReportsInTransaction(
    tx,
    candidate,
    {
      status: 'dispatched',
      dispatched_at: dispatchedAt,
      dispatch_payload: candidate.payload,
      dispatch_error: null,
      updated_at: updatedAt,
    },
    { requireLock: true },
  );
  if (updatedReports !== candidate.reportIds.length) {
    throw new Error(STALE_DISPATCH_SUCCESS_ERROR);
  }

  if (candidate.kind === 'cluster') {
    const updatedClusters = await tx
      .update(crowdReportClustersTable)
      .set({
        status: 'dispatched',
        dispatched_at: dispatchedAt,
        updated_at: updatedAt,
      })
      .where(
        and(
          eq(crowdReportClustersTable.id, candidate.id),
          eq(crowdReportClustersTable.status, 'accepted'),
          getCrowdReportClusterLockCondition(candidate),
          hasCrowdReportClusterDispatchPayloadReportCount(candidate),
        ),
      )
      .returning({ id: crowdReportClustersTable.id });

    if (updatedClusters.length === 0) {
      throw new Error(STALE_DISPATCH_SUCCESS_ERROR);
    }
  }

  return true;
}

async function releaseCrowdReportDispatchClusterLockInTransaction(
  tx: Pick<CrowdReportTransaction, 'update'>,
  candidate: LockableCrowdReportDispatchCandidate,
  updatedAt: string,
) {
  if (candidate.kind !== 'cluster') {
    return;
  }

  await tx
    .update(crowdReportClustersTable)
    .set({
      dispatched_at: null,
      updated_at: updatedAt,
    })
    .where(
      and(
        eq(crowdReportClustersTable.id, candidate.id),
        eq(crowdReportClustersTable.status, 'accepted'),
        getCrowdReportClusterLockCondition(candidate),
      ),
    );
}

async function markCrowdReportDispatchFailureInTransaction(
  tx: Pick<CrowdReportTransaction, 'update'>,
  candidate: LockableCrowdReportDispatchCandidate,
  message: string,
) {
  const updatedAt = DateTime.now().toUTC().toISO() ?? new Date().toISOString();
  await releaseCrowdReportDispatchClusterLockInTransaction(
    tx,
    candidate,
    updatedAt,
  );
  await updateCrowdReportDispatchReportsInTransaction(
    tx,
    candidate,
    {
      dispatch_payload: candidate.payload,
      dispatch_error: message.slice(0, 2000),
      updated_at: updatedAt,
    },
    {
      allowChangedScope: true,
      requireLock: true,
    },
  );
}

async function updateCrowdReportDispatchReportsInTransaction(
  tx: Pick<CrowdReportTransaction, 'update'>,
  candidate: LockableCrowdReportDispatchCandidate,
  values: Partial<typeof crowdReportsTable.$inferInsert>,
  options: { allowChangedScope?: boolean; requireLock?: boolean } = {},
) {
  let updatedCount = 0;
  for (const reportIds of chunk(candidate.reportIds, D1_REPORT_UPDATE_BATCH)) {
    const updatedRows = await tx
      .update(crowdReportsTable)
      .set(values)
      .where(
        and(
          inArray(crowdReportsTable.id, reportIds),
          options.allowChangedScope
            ? undefined
            : candidate.kind === 'cluster'
              ? and(
                  eq(crowdReportsTable.cluster_id, candidate.id),
                  inArray(crowdReportsTable.status, ['accepted', 'duplicate']),
                  eq(crowdReportsTable.still_happening, true),
                )
              : and(
                  eq(crowdReportsTable.id, candidate.id),
                  eq(crowdReportsTable.status, 'accepted'),
                  isNull(crowdReportsTable.cluster_id),
                ),
          isNull(crowdReportsTable.dispatched_at),
          options.requireLock
            ? getCrowdReportLockCondition(candidate)
            : undefined,
        ),
      )
      .returning({ id: crowdReportsTable.id });
    updatedCount += updatedRows.length;
  }
  return updatedCount;
}

function getCrowdReportLockCondition(
  candidate: LockableCrowdReportDispatchCandidate,
) {
  return and(
    eq(crowdReportsTable.dispatch_error, DISPATCH_LOCK_ERROR),
    candidate.dispatchLockAt == null
      ? undefined
      : eq(crowdReportsTable.updated_at, candidate.dispatchLockAt),
  );
}

function getCrowdReportClusterLockCondition(
  candidate: LockableCrowdReportDispatchCandidate,
) {
  return candidate.dispatchLockAt == null
    ? sql`${crowdReportClustersTable.dispatched_at} is not null`
    : eq(crowdReportClustersTable.dispatched_at, candidate.dispatchLockAt);
}

function hasCrowdReportClusterDispatchPayloadReportCount(
  candidate: CrowdReportDispatchCandidate,
) {
  if (candidate.reportIds.length === 0) {
    return sql`false`;
  }

  return sql`(
    select count(*)
    from ${crowdReportsTable}
    where ${crowdReportsTable.cluster_id} = ${candidate.id}
      and ${crowdReportsTable.status} in ('accepted', 'duplicate')
      and ${crowdReportsTable.still_happening} is true
  ) = ${candidate.reportIds.length}`;
}

async function isCrowdReportClusterDispatchPayloadCurrent(
  tx: Pick<CrowdReportTransaction, 'select'>,
  candidate: CrowdReportDispatchCandidate,
) {
  const expectedIds = new Set(candidate.reportIds);
  if (expectedIds.size === 0) {
    return false;
  }

  const currentRows = await tx
    .select({ id: crowdReportsTable.id })
    .from(crowdReportsTable)
    .where(
      and(
        eq(crowdReportsTable.cluster_id, candidate.id),
        inArray(crowdReportsTable.status, ['accepted', 'duplicate']),
        eq(crowdReportsTable.still_happening, true),
      ),
    );

  return (
    currentRows.length === expectedIds.size &&
    currentRows.every((row) => expectedIds.has(row.id))
  );
}

async function tryAcquireCrowdReportDispatchLockInTransaction(
  tx: CrowdReportTransaction,
  candidate: LockableCrowdReportDispatchCandidate,
  now = getDispatchLockNow(),
) {
  if (candidate.reportIds.length === 0) {
    return false;
  }

  const staleBefore = getDispatchLockStaleBefore(now);
  if (
    !(await isCrowdReportDispatchCandidateEligible(tx, candidate, {
      clusterStaleBefore: staleBefore,
    }))
  ) {
    return false;
  }

  if (candidate.kind === 'cluster') {
    const updatedClusters = await tx
      .update(crowdReportClustersTable)
      .set({
        dispatched_at: now,
        updated_at: now,
      })
      .where(
        and(
          eq(crowdReportClustersTable.id, candidate.id),
          eq(crowdReportClustersTable.status, 'accepted'),
          canAcquireCrowdReportClusterDispatchLockSql(staleBefore),
          hasCrowdReportClusterScope(),
          hasCrowdReportClusterCurrentConfidence(),
          hasCrowdReportClusterDispatchPayloadReportCount(candidate),
        ),
      )
      .returning({ id: crowdReportClustersTable.id });

    if (updatedClusters.length === 0) {
      return false;
    }
  }

  const updatedIds = new Set<string>();
  for (const reportIds of chunk(candidate.reportIds, D1_REPORT_UPDATE_BATCH)) {
    const updatedRows = await tx
      .update(crowdReportsTable)
      .set({
        dispatch_payload: candidate.payload,
        dispatch_error: DISPATCH_LOCK_ERROR,
        updated_at: now,
      })
      .where(
        and(
          inArray(crowdReportsTable.id, reportIds),
          candidate.kind === 'cluster'
            ? and(
                eq(crowdReportsTable.cluster_id, candidate.id),
                inArray(crowdReportsTable.status, ['accepted', 'duplicate']),
                eq(crowdReportsTable.still_happening, true),
              )
            : and(
                eq(crowdReportsTable.id, candidate.id),
                eq(crowdReportsTable.status, 'accepted'),
                isNull(crowdReportsTable.cluster_id),
              ),
          isNull(crowdReportsTable.dispatched_at),
          canAcquireCrowdReportDispatchLockSql(staleBefore),
        ),
      )
      .returning({ id: crowdReportsTable.id });
    for (const row of updatedRows) {
      updatedIds.add(row.id);
    }
  }
  const acquired =
    updatedIds.size === candidate.reportIds.length &&
    candidate.reportIds.every((id) => updatedIds.has(id));
  if (acquired) {
    candidate.dispatchLockAt = now;
    return true;
  }

  await releaseCrowdReportDispatchClusterLockInTransaction(tx, candidate, now);
  for (const reportIds of chunk([...updatedIds], D1_REPORT_UPDATE_BATCH)) {
    await tx
      .update(crowdReportsTable)
      .set({
        dispatch_payload: null,
        dispatch_error: null,
        updated_at: now,
      })
      .where(
        and(
          inArray(crowdReportsTable.id, reportIds),
          eq(crowdReportsTable.dispatch_error, DISPATCH_LOCK_ERROR),
        ),
      );
  }
  return false;
}

async function tryAcquireCrowdReportDispatchLock(
  db: AppDb,
  candidate: CrowdReportDispatchCandidate,
) {
  return runDbOrderedStatements(db, (tx) =>
    tryAcquireCrowdReportDispatchLockInTransaction(tx, candidate),
  );
}

async function isCrowdReportDispatchCandidateEligible(
  tx: CrowdReportTransaction,
  candidate: CrowdReportDispatchCandidate,
  options: { clusterStaleBefore?: string } = {},
) {
  if (candidate.kind === 'cluster') {
    const rows = await tx
      .select({ id: crowdReportClustersTable.id })
      .from(crowdReportClustersTable)
      .where(
        and(
          eq(crowdReportClustersTable.id, candidate.id),
          eq(crowdReportClustersTable.status, 'accepted'),
          options.clusterStaleBefore == null
            ? isNull(crowdReportClustersTable.dispatched_at)
            : canAcquireCrowdReportClusterDispatchLockSql(
                options.clusterStaleBefore,
              ),
          hasCrowdReportClusterScope(),
          hasCrowdReportClusterCurrentConfidence(),
          hasCrowdReportClusterDispatchPayloadReportCount(candidate),
        ),
      )
      .limit(1);
    return (
      rows.length > 0 &&
      (await isCrowdReportClusterDispatchPayloadCurrent(tx, candidate))
    );
  }

  const rows = await tx
    .select({ id: crowdReportsTable.id })
    .from(crowdReportsTable)
    .where(
      and(
        eq(crowdReportsTable.id, candidate.id),
        eq(crowdReportsTable.status, 'accepted'),
        isNull(crowdReportsTable.dispatched_at),
        isNull(crowdReportsTable.cluster_id),
        hasCrowdReportScope(),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function dispatchCrowdReportCandidateWithLock(
  db: AppDb,
  candidate: CrowdReportDispatchCandidate,
  config: CrowdReportDispatchConfig,
  fetchImpl: typeof fetch,
) {
  if (!(await tryAcquireCrowdReportDispatchLock(db, candidate))) {
    return { skipped: true as const };
  }

  try {
    const dispatchResponse = await dispatchCrowdReportPayloadToGitHub(
      candidate.payload,
      config,
      fetchImpl,
    );
    const marked = await markCrowdReportDispatchSuccess(db, candidate);
    if (!marked) {
      throw new Error(STALE_DISPATCH_SUCCESS_ERROR);
    }
    return { skipped: false as const, dispatchResponse };
  } catch (error) {
    await markCrowdReportDispatchFailure(db, candidate, error);
    return { skipped: false as const, error };
  }
}

export async function dispatchPendingCrowdReports(
  db: AppDb,
  options: CrowdReportDispatchOptions & CrowdReportDispatchConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CrowdReportDispatchRunResult> {
  const candidates =
    options.candidates ??
    (await getDispatchableCrowdReportCandidates(db, options));
  const results: CrowdReportDispatchRunResult['results'] = [];

  for (const candidate of candidates) {
    try {
      const result = await dispatchCrowdReportCandidateWithLock(
        db,
        candidate,
        options,
        fetchImpl,
      );
      if (result.skipped) {
        results.push({
          kind: candidate.kind,
          id: candidate.id,
          success: true,
          skipped: true,
        });
        continue;
      }
      if ('error' in result) {
        results.push({
          kind: candidate.kind,
          id: candidate.id,
          success: false,
          error:
            result.error instanceof Error
              ? result.error.message
              : String(result.error),
        });
        continue;
      }
      results.push({
        kind: candidate.kind,
        id: candidate.id,
        success: true,
        status: result.dispatchResponse.status,
      });
    } catch (error) {
      results.push({
        kind: candidate.kind,
        id: candidate.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failed = results.filter((result) => !result.success).length;
  return {
    success: failed === 0,
    count: candidates.length,
    dispatched: results.filter((result) => !result.skipped).length - failed,
    failed,
    results,
  };
}
