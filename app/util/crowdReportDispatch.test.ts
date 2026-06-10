import { IngestPayloadSchema } from '@mrtdown/ingest-contracts';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCrowdReportIngestPayload,
  buildCrowdReportSourceUrl,
  dispatchCrowdReportPayloadToGitHub,
  getDispatchableCrowdReportCandidates,
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

describe('buildCrowdReportIngestPayload', () => {
  it('builds a valid crowd-report ingest payload without site-local metadata', () => {
    const candidate = buildCrowdReportIngestPayload({
      kind: 'cluster',
      id: 'cluster-1',
      reportIds: ['report-1', 'report-2', 'report-3'],
      text: 'The train has been stopped for a while.',
      createdAt: '2026-05-24T04:40:00.000Z',
      observedAt: '2026-05-24T12:30:00.000+08:00',
      lineIds: ['BPLRT'],
      stationIds: ['BP6'],
      directionText: 'Towards Choa Chu Kang',
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
      url: 'https://mrtdown.example/report?communitySource=cluster%3Acluster-1',
    });
    expect(candidate.payload.content[0]).not.toHaveProperty('ipHash');
    expect(candidate.payload.content[0]).not.toHaveProperty(
      'turnstileTokenHash',
    );
  });

  it('requires at least one affected line or station through the ingest contract', () => {
    expect(() =>
      buildCrowdReportIngestPayload({
        kind: 'report',
        id: 'report-1',
        reportIds: ['report-1'],
        text: 'The train has been stopped for a while.',
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
    ).toBe('https://mrtdown.example/report?communitySource=report%3Ar1');
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
          url: 'https://mrtdown.example/report?communitySource=report%3Areport-1',
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
          url: 'https://mrtdown.example/report?communitySource=report%3Areport-1',
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
          url: 'https://mrtdown.example/report?communitySource=report%3Areport-1',
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
