import { IngestPayloadSchema } from '@mrtdown/ingest-contracts';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCrowdReportIngestPayload,
  buildCrowdReportSourceUrl,
  dispatchCrowdReportPayloadToGitHub,
  dispatchPendingCrowdReports,
  getDispatchableCrowdReportCandidates,
  markCrowdReportDispatchSuccess,
} from './crowdReportDispatch';

function makeFakeCandidateDb() {
  const whereCalls: unknown[] = [];
  const selectBuilder = {
    from() {
      return this;
    },
    where(condition: unknown) {
      whereCalls.push(condition);
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      return Promise.resolve([]);
    },
  };

  return {
    whereCalls,
    db: {
      select() {
        return selectBuilder;
      },
    },
  };
}

function makeFakeClusterCandidateDb() {
  const whereCalls: unknown[] = [];
  const selectResults = [
    [
      {
        id: 'cluster-1',
        effect: 'delay',
        reportCount: 1,
        windowEndAt: '2026-05-24T04:40:00.000Z',
        updatedAt: '2026-05-24T04:45:00.000Z',
      },
    ],
    [{ clusterId: 'cluster-1', lineId: 'BPLRT' }],
    [{ clusterId: 'cluster-1', stationId: 'BP6' }],
    [
      {
        id: 'report-1',
        clusterId: 'cluster-1',
        observedAt: '2026-05-24T04:30:00.000Z',
        text: 'Train stalled near the platform for several minutes.',
        directionText: 'towards:BP6',
        delayMinutes: 10,
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
          where(condition: unknown) {
            whereCalls.push(condition);
            if (selectIndex === 1 || selectIndex === 2) {
              return Promise.resolve(selectResults[selectIndex]);
            }
            return this;
          },
          orderBy() {
            if (selectIndex === 3) {
              return Promise.resolve(selectResults[selectIndex]);
            }
            return this;
          },
          limit() {
            return Promise.resolve(selectResults[selectIndex]);
          },
        };
      },
    },
  };
}

function makeFakeDispatchUpdateDb(
  clusterUpdateRows: Array<{ id: string }> = [{ id: 'cluster-1' }],
) {
  const whereCalls: unknown[] = [];
  let updateCount = 0;
  const updateBuilder = {
    set() {
      const updateIndex = updateCount;
      updateCount += 1;
      return {
        where(condition: unknown) {
          whereCalls.push(condition);
          if (updateIndex === 0) {
            return {
              returning() {
                return Promise.resolve(clusterUpdateRows);
              },
            };
          }
          return Promise.resolve();
        },
      };
    },
  };

  return {
    whereCalls,
    db: {
      transaction<T>(
        callback: (transaction: {
          update: () => typeof updateBuilder;
        }) => Promise<T>,
      ) {
        return callback({
          update() {
            return updateBuilder;
          },
        });
      },
    },
  };
}

function makeFakeDispatchEligibilityDb() {
  const executeCalls: unknown[] = [];
  const whereCalls: unknown[] = [];
  const selectBuilder = {
    from() {
      return this;
    },
    where(condition: unknown) {
      whereCalls.push(condition);
      return this;
    },
    limit() {
      return Promise.resolve([]);
    },
  };

  return {
    executeCalls,
    whereCalls,
    db: {
      transaction<T>(
        callback: (transaction: {
          run: (
            query: unknown,
          ) => Promise<{ results: Array<{ locked: boolean }> }>;
          select: () => typeof selectBuilder;
        }) => Promise<T>,
      ) {
        return callback({
          run(query: unknown) {
            executeCalls.push(query);
            return Promise.resolve({ results: [{ locked: true }] });
          },
          select() {
            return selectBuilder;
          },
        });
      },
    },
  };
}

function makeFakePostSendMarkMissDb() {
  const executeCalls: unknown[] = [];
  const updateSets: unknown[] = [];
  const whereCalls: unknown[] = [];
  let updateCount = 0;
  const selectBuilder = {
    from() {
      return this;
    },
    where(condition: unknown) {
      whereCalls.push(condition);
      return this;
    },
    limit() {
      return Promise.resolve([{ id: 'cluster-1' }]);
    },
  };
  const updateBuilder = {
    set(values: unknown) {
      const updateIndex = updateCount;
      updateCount += 1;
      updateSets.push(values);
      return {
        where(condition: unknown) {
          whereCalls.push(condition);
          if (updateIndex === 0) {
            return {
              returning() {
                return Promise.resolve([]);
              },
            };
          }
          return Promise.resolve();
        },
      };
    },
  };

  return {
    executeCalls,
    updateSets,
    whereCalls,
    db: {
      transaction<T>(
        callback: (transaction: {
          run: (
            query: unknown,
          ) => Promise<{ results: Array<{ locked: boolean }> }>;
          select: () => typeof selectBuilder;
          update: () => typeof updateBuilder;
        }) => Promise<T>,
      ) {
        return callback({
          run(query: unknown) {
            executeCalls.push(query);
            return Promise.resolve({ results: [{ locked: true }] });
          },
          select() {
            return selectBuilder;
          },
          update() {
            return updateBuilder;
          },
        });
      },
    },
  };
}

describe('buildCrowdReportIngestPayload', () => {
  it('builds a valid crowd-report ingest payload without reporter text', () => {
    const candidate = buildCrowdReportIngestPayload({
      kind: 'cluster',
      id: 'cluster-1',
      reportIds: ['report-1', 'report-2', 'report-3'],
      createdAt: '2026-05-24T04:40:00.000Z',
      observedAt: '2026-05-24T12:30:00.000+08:00',
      lineIds: ['BPLRT'],
      stationIds: ['BP6'],
      directionText: 'towards:BP6',
      effect: 'delay',
      delayMinutes: 10,
      reportCount: 3,
      isStillHappening: true,
      rootUrl: 'https://mrtdown.example',
    });

    expect(IngestPayloadSchema.safeParse(candidate.payload).success).toBe(true);
    expect(candidate.payload.content[0]).toMatchObject({
      source: 'crowd-report',
      reportId: 'cluster:cluster-1',
      lineIds: ['BPLRT'],
      stationIds: ['BP6'],
      effect: 'delay',
      delayMinutes: 10,
      reportCount: 3,
      url: 'https://mrtdown.example/community-reports/cluster/cluster-1',
    });
    expect(candidate.payload.content[0]).not.toHaveProperty('ipHash');
    expect(candidate.payload.content[0]).not.toHaveProperty(
      'turnstileTokenHash',
    );
    expect(candidate.payload.content[0]).toHaveProperty(
      'directionText',
      'towards:BP6',
    );
    const content = candidate.payload.content[0];
    if (content.source !== 'crowd-report') {
      throw new Error(`Expected crowd-report content, got ${content.source}`);
    }
    expect(content.text).toContain('Direction: towards:BP6.');
    expect(content.text).toContain('Reporter notes are not collected.');
  });

  it('preserves structured direction text in the canonical ingest payload', () => {
    const candidate = buildCrowdReportIngestPayload({
      kind: 'report',
      id: 'report-1',
      reportIds: ['report-1'],
      createdAt: '2026-05-24T04:40:00.000Z',
      observedAt: '2026-05-24T12:30:00.000+08:00',
      lineIds: ['BPLRT'],
      stationIds: [],
      directionText: 'towards:BP6',
      effect: 'delay',
      delayMinutes: null,
      reportCount: 1,
      isStillHappening: true,
      rootUrl: 'https://mrtdown.example',
    });

    expect(candidate.payload.content[0]).toHaveProperty(
      'directionText',
      'towards:BP6',
    );
    const content = candidate.payload.content[0];
    if (content.source !== 'crowd-report') {
      throw new Error(`Expected crowd-report content, got ${content.source}`);
    }
    expect(content.text).toContain('Direction: towards:BP6.');
    expect(content.text).toContain('A community report describes this issue.');
  });

  it('requires at least one affected line or station through the ingest contract', () => {
    expect(() =>
      buildCrowdReportIngestPayload({
        kind: 'report',
        id: 'report-1',
        reportIds: ['report-1'],
        createdAt: '2026-05-24T04:40:00.000Z',
        observedAt: '2026-05-24T12:30:00.000+08:00',
        lineIds: [],
        stationIds: [],
        directionText: null,
        effect: 'delay',
        delayMinutes: null,
        reportCount: 1,
        isStillHappening: null,
        rootUrl: 'https://mrtdown.example',
      }),
    ).toThrow();
  });
});

describe('buildCrowdReportSourceUrl', () => {
  it('uses a stable public report URL with a non-PII community source id', () => {
    expect(
      buildCrowdReportSourceUrl('https://mrtdown.example', 'report', 'r1'),
    ).toBe('https://mrtdown.example/community-reports/report/r1');
  });
});

describe('getDispatchableCrowdReportCandidates', () => {
  it('requires cluster affected-area scope before applying the result limit', async () => {
    const fake = makeFakeCandidateDb();

    await getDispatchableCrowdReportCandidates(fake.db as never, {
      kind: 'cluster',
      limit: 1,
      rootUrl: 'https://mrtdown.example',
    });

    const dialect = new PgDialect();
    const whereSql = dialect.sqlToQuery(fake.whereCalls[0] as SQL).sql;

    expect(whereSql).toContain('crowd_report_cluster_lines');
    expect(whereSql).toContain('crowd_report_cluster_stations');
    expect(whereSql).toContain('still_happening');
    expect(whereSql).toContain('count(distinct');
  });

  it('requires single-report affected-area scope before applying the result limit', async () => {
    const fake = makeFakeCandidateDb();

    await getDispatchableCrowdReportCandidates(fake.db as never, {
      kind: 'report',
      limit: 1,
      rootUrl: 'https://mrtdown.example',
    });

    const dialect = new PgDialect();
    const whereSql = dialect.sqlToQuery(fake.whereCalls[0] as SQL).sql;

    expect(whereSql).toContain('crowd_report_lines');
    expect(whereSql).toContain('crowd_report_stations');
  });

  it('builds cluster dispatch payloads from ongoing reports only', async () => {
    const fake = makeFakeClusterCandidateDb();

    await getDispatchableCrowdReportCandidates(fake.db as never, {
      kind: 'cluster',
      limit: 1,
      rootUrl: 'https://mrtdown.example',
    });

    const dialect = new PgDialect();
    const reportRowsWhereSql = dialect.sqlToQuery(
      fake.whereCalls[3] as SQL,
    ).sql;

    expect(reportRowsWhereSql).toContain('"still_happening" =');
  });

  it('marks only the report IDs included in a cluster dispatch payload', async () => {
    const fake = makeFakeDispatchUpdateDb();

    await markCrowdReportDispatchSuccess(
      fake.db as never,
      {
        kind: 'cluster',
        id: 'cluster-1',
        reportIds: ['ongoing-report-1', 'ongoing-report-2'],
        payload: IngestPayloadSchema.parse({
          content: [
            {
              source: 'crowd-report',
              reportId: 'cluster:cluster-1',
              text: 'Two community reports describe this issue.',
              createdAt: '2026-05-24T04:40:00.000Z',
              observedAt: '2026-05-24T12:30:00.000+08:00',
              lineIds: ['BPLRT'],
              reportCount: 2,
              url: 'https://mrtdown.example/community-reports/cluster/cluster-1',
            },
          ],
        }),
      },
      '2026-05-24T04:45:00.000Z',
    );

    const dialect = new PgDialect();
    const clusterUpdateWhereSql = dialect.sqlToQuery(
      fake.whereCalls[0] as SQL,
    ).sql;
    const reportUpdateWhereSql = dialect.sqlToQuery(
      fake.whereCalls[1] as SQL,
    ).sql;

    expect(clusterUpdateWhereSql).toContain('not exists');
    expect(clusterUpdateWhereSql).toContain('"still_happening" is true');
    expect(clusterUpdateWhereSql).toContain('"crowd_reports"."id" not in');
    expect(clusterUpdateWhereSql).toContain('count(*)');
    expect(clusterUpdateWhereSql).not.toContain('::int');
    expect(clusterUpdateWhereSql).toContain('"crowd_reports"."id" in');
    expect(reportUpdateWhereSql).toContain('"crowd_reports"."id" in');
    expect(reportUpdateWhereSql).not.toContain(
      '"crowd_reports"."cluster_id" =',
    );
  });

  it('does not mark cluster payload reports when the cluster freshness update misses', async () => {
    const fake = makeFakeDispatchUpdateDb([]);

    await expect(
      markCrowdReportDispatchSuccess(
        fake.db as never,
        {
          kind: 'cluster',
          id: 'cluster-1',
          reportIds: ['stale-report-1'],
          payload: IngestPayloadSchema.parse({
            content: [
              {
                source: 'crowd-report',
                reportId: 'cluster:cluster-1',
                text: 'A community report describes this issue.',
                createdAt: '2026-05-24T04:40:00.000Z',
                observedAt: '2026-05-24T12:30:00.000+08:00',
                lineIds: ['BPLRT'],
                reportCount: 1,
                url: 'https://mrtdown.example/community-reports/cluster/cluster-1',
              },
            ],
          }),
        },
        '2026-05-24T04:45:00.000Z',
      ),
    ).resolves.toBe(false);

    expect(fake.whereCalls).toHaveLength(1);
  });

  it('rechecks cluster payload freshness under the dispatch lock', async () => {
    const fake = makeFakeDispatchEligibilityDb();
    const fetchImpl = vi.fn();

    await dispatchPendingCrowdReports(
      fake.db as never,
      {
        rootUrl: 'https://mrtdown.example',
        token: 'github-token',
        candidates: [
          {
            kind: 'cluster',
            id: 'cluster-1',
            reportIds: ['ongoing-report-1', 'ongoing-report-2'],
            payload: IngestPayloadSchema.parse({
              content: [
                {
                  source: 'crowd-report',
                  reportId: 'cluster:cluster-1',
                  text: 'Two community reports describe this issue.',
                  createdAt: '2026-05-24T04:40:00.000Z',
                  observedAt: '2026-05-24T12:30:00.000+08:00',
                  lineIds: ['BPLRT'],
                  reportCount: 2,
                  url: 'https://mrtdown.example/community-reports/cluster/cluster-1',
                },
              ],
            }),
          },
        ],
      },
      fetchImpl,
    );

    const dialect = new PgDialect();
    const lockSql = dialect.sqlToQuery(fake.executeCalls[0] as SQL);
    const eligibilityWhereSql = dialect.sqlToQuery(
      fake.whereCalls[0] as SQL,
    ).sql;

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lockSql.params).toContain('crowd-report-dispatch:cluster:cluster-1');
    expect(eligibilityWhereSql).toContain('not exists');
    expect(eligibilityWhereSql).toContain('"still_happening" is true');
    expect(eligibilityWhereSql).toContain('"crowd_reports"."id" not in');
    expect(eligibilityWhereSql).toContain('count(*)');
    expect(eligibilityWhereSql).not.toContain('::int');
    expect(eligibilityWhereSql).toContain('"crowd_reports"."id" in');
  });

  it('reports a post-send stale local success mark as failed without closing the cluster', async () => {
    const fake = makeFakePostSendMarkMissDb();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    await expect(
      dispatchPendingCrowdReports(
        fake.db as never,
        {
          rootUrl: 'https://mrtdown.example',
          token: 'github-token',
          candidates: [
            {
              kind: 'cluster',
              id: 'cluster-1',
              reportIds: ['stale-report-1'],
              payload: IngestPayloadSchema.parse({
                content: [
                  {
                    source: 'crowd-report',
                    reportId: 'cluster:cluster-1',
                    text: 'A community report describes this issue.',
                    createdAt: '2026-05-24T04:40:00.000Z',
                    observedAt: '2026-05-24T12:30:00.000+08:00',
                    lineIds: ['BPLRT'],
                    reportCount: 1,
                    url: 'https://mrtdown.example/community-reports/cluster/cluster-1',
                  },
                ],
              }),
            },
          ],
        },
        fetchImpl,
      ),
    ).resolves.toMatchObject({
      success: false,
      count: 1,
      dispatched: 0,
      failed: 1,
      results: [
        {
          kind: 'cluster',
          id: 'cluster-1',
          success: false,
          error:
            'Crowd report dispatch was sent, but local success marking became stale',
        },
      ],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fake.updateSets).toHaveLength(2);
    expect(fake.updateSets[1]).toMatchObject({
      dispatch_error:
        'Crowd report dispatch was sent, but local success marking became stale',
    });
  });
});

describe('dispatchCrowdReportPayloadToGitHub', () => {
  it('posts the ingest payload as a repository_dispatch event', async () => {
    const payload = IngestPayloadSchema.parse({
      content: [
        {
          source: 'crowd-report',
          reportId: 'report:report-1',
          text: 'A community report describes this issue.',
          createdAt: '2026-05-24T04:40:00.000Z',
          observedAt: '2026-05-24T12:30:00.000+08:00',
          lineIds: ['BPLRT'],
          reportCount: 1,
          url: 'https://mrtdown.example/community-reports/report/report-1',
        },
      ],
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    await expect(
      dispatchCrowdReportPayloadToGitHub(
        payload,
        {
          token: 'github-token',
          owner: 'foldaway',
          repo: 'mrtdown-data',
          eventType: 'ingest',
        },
        fetchImpl,
      ),
    ).resolves.toEqual({ status: 204, responseText: '' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/foldaway/mrtdown-data/dispatches',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer github-token',
          'X-GitHub-Api-Version': '2022-11-28',
        }),
        body: JSON.stringify({
          event_type: 'ingest',
          client_payload: payload,
        }),
      }),
    );
  });

  it('surfaces GitHub dispatch failures with response context', async () => {
    const payload = IngestPayloadSchema.parse({
      content: [
        {
          source: 'crowd-report',
          reportId: 'report:report-1',
          text: 'A community report describes this issue.',
          createdAt: '2026-05-24T04:40:00.000Z',
          observedAt: '2026-05-24T12:30:00.000+08:00',
          lineIds: ['BPLRT'],
          reportCount: 1,
          url: 'https://mrtdown.example/community-reports/report/report-1',
        },
      ],
    });

    await expect(
      dispatchCrowdReportPayloadToGitHub(
        payload,
        { token: 'github-token' },
        vi.fn().mockResolvedValue(
          new Response('bad credentials', {
            status: 401,
          }),
        ),
      ),
    ).rejects.toThrow(
      'GitHub repository_dispatch failed with 401: bad credentials',
    );
  });

  it('times out hanging GitHub dispatch requests', async () => {
    const payload = IngestPayloadSchema.parse({
      content: [
        {
          source: 'crowd-report',
          reportId: 'report:report-1',
          text: 'A community report describes this issue.',
          createdAt: '2026-05-24T04:40:00.000Z',
          observedAt: '2026-05-24T12:30:00.000+08:00',
          lineIds: ['BPLRT'],
          reportCount: 1,
          url: 'https://mrtdown.example/community-reports/report/report-1',
        },
      ],
    });
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }),
    );

    await expect(
      dispatchCrowdReportPayloadToGitHub(
        payload,
        { token: 'github-token', timeoutMs: 1 },
        fetchImpl,
      ),
    ).rejects.toThrow('GitHub repository_dispatch timed out after 1ms');
  });
});
