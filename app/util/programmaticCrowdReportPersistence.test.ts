import { DateTime } from 'luxon';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  crowdReportAbuseEventsTable,
  crowdReportClusterLinesTable,
  crowdReportClustersTable,
  crowdReportClusterStationsTable,
  crowdReportLinesTable,
  crowdReportModerationEventsTable,
  crowdReportRateLimitsTable,
  crowdReportsTable,
  crowdReportStationsTable,
} from '~/db/schema';
import {
  CrowdReportIdempotencyConflictError,
  findProgrammaticCrowdReportRetry,
  persistAutomoderatedProgrammaticCrowdReport,
  type CrowdReportSubmission,
} from './crowdReports';

const NOW = DateTime.fromISO('2026-07-18T12:00:00+08:00', {
  setZone: true,
});

const SUBMISSION: CrowdReportSubmission = {
  reportScope: 'line',
  observedAt: '2026-07-18T11:55:00+08:00',
  lineIds: ['CCL'],
  stationIds: ['CC1'],
  effect: 'delay',
  delayMinutes: 10,
  isStillHappening: true,
};

const DELIVERY = {
  producer: 'reddit-monitor',
  externalReportId: 'opaque-post-id',
  sourceUrl: 'https://www.reddit.com/r/singapore/comments/example',
  requestPayloadDigest: 'a'.repeat(64),
};

function makeFakeDb(
  options: {
    insertedReport?: { id: string };
    selectResults?: unknown[][];
    updatedReport?: {
      id: string;
      status: 'accepted' | 'duplicate';
      duplicateOfId: string | null;
    };
  } = {},
) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const conflicts: unknown[] = [];
  const selectResults = [...(options.selectResults ?? [[]])];
  const insertedReport =
    options.insertedReport === undefined
      ? { id: 'report-1' }
      : options.insertedReport;
  const updatedReport = options.updatedReport ?? {
    id: 'report-1',
    status: 'accepted',
    duplicateOfId: null,
  };
  const selectBuilder = {
    from() {
      return this;
    },
    where() {
      return this;
    },
    orderBy() {
      return this;
    },
    offset() {
      return this;
    },
    limit() {
      return Promise.resolve(selectResults.shift() ?? []);
    },
  };
  const tx = {
    execute() {
      return Promise.resolve();
    },
    select() {
      return selectBuilder;
    },
    insert(table: unknown) {
      return {
        values(values: unknown) {
          inserts.push({ table, values });
          if (table === crowdReportsTable) {
            return {
              onConflictDoNothing(config: unknown) {
                conflicts.push(config);
                return {
                  returning() {
                    return Promise.resolve(
                      insertedReport == null ? [] : [insertedReport],
                    );
                  },
                };
              },
            };
          }
          return Promise.resolve();
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: unknown) {
          updates.push({ table, values });
          return {
            where() {
              return {
                returning() {
                  return Promise.resolve([updatedReport]);
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    inserts,
    updates,
    conflicts,
    db: {
      select: tx.select,
      transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
        return callback(tx);
      },
    },
  };
}

describe('persistAutomoderatedProgrammaticCrowdReport', () => {
  it('records provenance, skips public abuse state, and trusts one producer report', async () => {
    const fake = makeFakeDb();
    const ids = ['report-1', 'submitted-event', 'accepted-event', 'cluster-1'];

    await expect(
      persistAutomoderatedProgrammaticCrowdReport(
        fake.db as never,
        SUBMISSION,
        DELIVERY,
        {
          now: NOW,
          idFactory: () => ids.shift() ?? 'fallback-id',
        },
      ),
    ).resolves.toEqual({
      id: 'report-1',
      status: 'accepted',
      duplicateOfId: null,
      created: true,
    });

    expect(fake.inserts.map((insert) => insert.table)).toEqual([
      crowdReportsTable,
      crowdReportLinesTable,
      crowdReportStationsTable,
      crowdReportModerationEventsTable,
      crowdReportModerationEventsTable,
      crowdReportClustersTable,
      crowdReportClusterLinesTable,
      crowdReportClusterStationsTable,
    ]);
    expect(fake.inserts[0]?.values).toMatchObject({
      id: 'report-1',
      producer: 'reddit-monitor',
      external_report_id: 'opaque-post-id',
      source_url: DELIVERY.sourceUrl,
      request_payload_digest: DELIVERY.requestPayloadDigest,
    });
    expect(fake.inserts.map((insert) => insert.table)).not.toContain(
      crowdReportAbuseEventsTable,
    );
    expect(fake.inserts.map((insert) => insert.table)).not.toContain(
      crowdReportRateLimitsTable,
    );
    expect(fake.inserts[5]?.values).toMatchObject({ status: 'accepted' });
    expect(fake.conflicts).toHaveLength(1);
  });

  it('returns the winning concurrent insert without adding side effects', async () => {
    const fake = makeFakeDb({
      insertedReport: null as never,
      selectResults: [
        [
          {
            id: 'existing-report',
            status: 'accepted',
            duplicateOfId: null,
            requestPayloadDigest: DELIVERY.requestPayloadDigest,
          },
        ],
      ],
    });

    await expect(
      persistAutomoderatedProgrammaticCrowdReport(
        fake.db as never,
        SUBMISSION,
        DELIVERY,
      ),
    ).resolves.toEqual({
      id: 'existing-report',
      status: 'accepted',
      duplicateOfId: null,
      created: false,
    });
    expect(fake.inserts).toHaveLength(1);
    expect(fake.updates).toHaveLength(0);
  });

  it('accepts a single authenticated resolution report for dispatch', async () => {
    const fake = makeFakeDb();
    const ids = ['report-1', 'submitted-event', 'accepted-event', 'cluster-1'];

    await persistAutomoderatedProgrammaticCrowdReport(
      fake.db as never,
      { ...SUBMISSION, isStillHappening: false },
      DELIVERY,
      {
        now: NOW,
        idFactory: () => ids.shift() ?? 'fallback-id',
      },
    );

    expect(fake.inserts[5]?.values).toMatchObject({ status: 'accepted' });
  });

  it('promotes a pending cluster for a trusted recovery duplicate', async () => {
    const fake = makeFakeDb({
      selectResults: [
        [
          {
            id: 'existing-report',
            status: 'accepted',
            observedAt: '2026-07-18T11:54:00+08:00',
            directionText: null,
            clusterId: 'cluster-1',
          },
        ],
        [{ reportId: 'existing-report', lineId: 'CCL' }],
        [{ reportId: 'existing-report', stationId: 'CC1' }],
        [{ id: 'cluster-1' }],
      ],
      updatedReport: {
        id: 'report-1',
        status: 'duplicate',
        duplicateOfId: 'existing-report',
      },
    });
    const ids = ['report-1', 'submitted-event', 'duplicate-event'];

    await expect(
      persistAutomoderatedProgrammaticCrowdReport(
        fake.db as never,
        { ...SUBMISSION, isStillHappening: false },
        DELIVERY,
        {
          now: NOW,
          idFactory: () => ids.shift() ?? 'fallback-id',
        },
      ),
    ).resolves.toEqual({
      id: 'report-1',
      status: 'duplicate',
      duplicateOfId: 'existing-report',
      created: true,
    });

    const clusterStatus = fake.updates[2]?.values as { status: SQL };
    const statusSql = new PgDialect().sqlToQuery(clusterStatus.status).sql;
    expect(statusSql).toContain("then 'accepted'");
    expect(statusSql).not.toContain('still_happening');
    expect(statusSql).not.toContain('count(distinct');
  });
});

describe('findProgrammaticCrowdReportRetry', () => {
  it('rejects reuse of an external ID with a different payload', async () => {
    const fake = makeFakeDb({
      selectResults: [
        [
          {
            id: 'existing-report',
            status: 'accepted',
            duplicateOfId: null,
            requestPayloadDigest: 'different-digest',
          },
        ],
      ],
    });

    await expect(
      findProgrammaticCrowdReportRetry(fake.db as never, DELIVERY),
    ).rejects.toEqual(
      new CrowdReportIdempotencyConflictError('existing-report'),
    );
  });
});
