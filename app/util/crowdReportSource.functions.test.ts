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

function makeFakeClusterSourceDb() {
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
    [
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
  it('builds cluster evidence from ongoing reports only', async () => {
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
  });
});
