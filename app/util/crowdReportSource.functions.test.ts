import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { getCrowdReportSource } from './crowdReportSource.functions';

vi.mock('~/db', () => ({
  getDb: vi.fn(),
}));

function name(value: string) {
  return {
    'en-SG': value,
    'zh-Hans': null,
    ms: null,
    ta: null,
  };
}

function makeFakeClusterSourceDb(
  reportRows: Array<{
    observedAt: string;
    directionText: string | null;
    delayMinutes: number | null;
    stillHappening: boolean;
  }> = [
    {
      observedAt: '2026-05-24T04:30:00.000Z',
      directionText: 'towards:BP6',
      delayMinutes: 10,
      stillHappening: true,
    },
    {
      observedAt: '2026-05-24T04:40:00.000Z',
      directionText: null,
      delayMinutes: null,
      stillHappening: true,
    },
  ],
) {
  const whereCalls: unknown[] = [];
  const selectResults = [
    [
      {
        id: 'cluster-1',
        effect: 'delay',
        status: 'dispatched',
        windowStartAt: '2026-05-24T04:20:00.000Z',
        windowEndAt: '2026-05-24T04:50:00.000Z',
        dispatchedAt: '2026-05-24T04:55:00.000Z',
        updatedAt: '2026-05-24T04:55:00.000Z',
      },
    ],
    [{ id: 'BPLRT', name: name('Bukit Panjang LRT'), color: '#718472' }],
    [{ id: 'BP6', name: name('Bukit Panjang') }],
    reportRows,
  ];
  let selectCount = 0;

  return {
    whereCalls,
    db: {
      select() {
        const selectIndex = selectCount;
        selectCount += 1;
        return {
          from() {
            return this;
          },
          innerJoin() {
            return this;
          },
          where(condition: unknown) {
            whereCalls.push(condition);
            return this;
          },
          orderBy() {
            return Promise.resolve(selectResults[selectIndex]);
          },
          limit() {
            return Promise.resolve(selectResults[selectIndex]);
          },
        };
      },
    },
  };
}

function makeFakeReportSourceDb(
  reportRows: Array<{
    id: string;
    observedAt: string;
    directionText: string | null;
    effect: string;
    delayMinutes: number | null;
    stillHappening: boolean;
    status: string;
    dispatchedAt: string | null;
    updatedAt: string;
  }>,
) {
  const whereCalls: unknown[] = [];
  const selectResults = [
    reportRows,
    [{ id: 'BPLRT', name: name('Bukit Panjang LRT'), color: '#718472' }],
    [{ id: 'BP6', name: name('Bukit Panjang') }],
  ];
  let selectCount = 0;

  return {
    whereCalls,
    db: {
      select() {
        const selectIndex = selectCount;
        selectCount += 1;
        return {
          from() {
            return this;
          },
          innerJoin() {
            return this;
          },
          where(condition: unknown) {
            whereCalls.push(condition);
            return this;
          },
          orderBy() {
            return Promise.resolve(selectResults[selectIndex]);
          },
          limit() {
            return Promise.resolve(selectResults[selectIndex]);
          },
        };
      },
    },
  };
}

describe('getCrowdReportSource', () => {
  it('builds cluster evidence from ongoing public reports', async () => {
    const fake = makeFakeClusterSourceDb();

    const source = await getCrowdReportSource(fake.db as never, {
      kind: 'cluster',
      sourceId: 'cluster-1',
    });

    expect(source).toMatchObject({
      kind: 'cluster',
      id: 'cluster-1',
      reportCount: 2,
      observedStartAt: '2026-05-24T04:30:00.000Z',
      observedEndAt: '2026-05-24T04:40:00.000Z',
      stillHappening: true,
    });

    const dialect = new PgDialect();
    const reportWhereSql = dialect.sqlToQuery(fake.whereCalls[3] as SQL).sql;

    expect(reportWhereSql).toContain('"crowd_reports"."still_happening" =');
    expect(reportWhereSql).toContain('"crowd_reports"."producer" <>');
  });

  it('keeps recovery-only authenticated cluster sources resolvable', async () => {
    const fake = makeFakeClusterSourceDb([
      {
        observedAt: '2026-05-24T04:50:00.000Z',
        directionText: null,
        delayMinutes: 0,
        stillHappening: false,
      },
    ]);

    const source = await getCrowdReportSource(fake.db as never, {
      kind: 'cluster',
      sourceId: 'cluster-1',
    });

    expect(source).toMatchObject({
      kind: 'cluster',
      id: 'cluster-1',
      reportCount: 1,
      observedStartAt: '2026-05-24T04:50:00.000Z',
      observedEndAt: '2026-05-24T04:50:00.000Z',
      stillHappening: false,
    });
  });

  it('builds single-report evidence for accepted unclustered reports with scope', async () => {
    const fake = makeFakeReportSourceDb([
      {
        id: 'report-1',
        observedAt: '2026-05-24T04:30:00.000Z',
        directionText: 'towards:BP6',
        effect: 'delay',
        delayMinutes: 10,
        stillHappening: true,
        status: 'accepted',
        dispatchedAt: null,
        updatedAt: '2026-05-24T04:35:00.000Z',
      },
    ]);

    const source = await getCrowdReportSource(fake.db as never, {
      kind: 'report',
      sourceId: 'report-1',
    });

    expect(source).toMatchObject({
      kind: 'report',
      id: 'report-1',
      status: 'accepted',
      effect: 'delay',
      reportCount: 1,
      observedStartAt: '2026-05-24T04:30:00.000Z',
      observedEndAt: '2026-05-24T04:30:00.000Z',
      updatedAt: '2026-05-24T04:35:00.000Z',
      dispatchedAt: null,
      directionText: 'towards:BP6',
      delayMinutes: 10,
      stillHappening: true,
      lines: [
        { id: 'BPLRT', name: name('Bukit Panjang LRT'), color: '#718472' },
      ],
      stations: [{ id: 'BP6', name: name('Bukit Panjang') }],
    });
  });

  it('requires single-report sources to be unclustered and scoped', async () => {
    const fake = makeFakeReportSourceDb([]);

    const source = await getCrowdReportSource(fake.db as never, {
      kind: 'report',
      sourceId: 'report-1',
    });

    expect(source).toBeNull();

    const dialect = new PgDialect();
    const reportWhereSql = dialect.sqlToQuery(fake.whereCalls[0] as SQL).sql;

    expect(reportWhereSql).toContain('"crowd_reports"."cluster_id" is null');
    expect(reportWhereSql).toContain('crowd_report_lines');
    expect(reportWhereSql).toContain('crowd_report_stations');
  });
});
