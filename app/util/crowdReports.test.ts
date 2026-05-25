import { DateTime } from 'luxon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  crowdReportAbuseEventsTable,
  crowdReportLinesTable,
  crowdReportModerationEventsTable,
  crowdReportRateLimitsTable,
  crowdReportsTable,
  crowdReportStationsTable,
} from '~/db/schema';
import {
  automoderateCrowdReport,
  CrowdReportRateLimitError,
  getCrowdReportRateLimitBucketStart,
  parseCrowdReportJsonBody,
  persistCrowdReport,
  validateCrowdReportSubmission,
  verifyTurnstileToken,
  type CrowdReportSubmission,
} from './crowdReports';

const NOW = DateTime.fromISO('2026-05-24T12:34:00+08:00', {
  setZone: true,
});

const VALID_SUBMISSION: CrowdReportSubmission = {
  observedAt: '2026-05-24T12:30:00.000+08:00',
  lineIds: ['BPLRT'],
  stationIds: ['BP6'],
  text: 'Train stalled near the platform for several minutes.',
  directionText: 'Towards Choa Chu Kang',
  effect: 'delay',
  delayMinutes: 10,
  isStillHappening: true,
};

function makeStreamingRequest(body: string) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });

  return new Request('https://example.com/api/reports', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function makeFakeDb(rateLimitCount: number) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const conflictUpdates: unknown[] = [];
  const tx = {
    insert(table: unknown) {
      return {
        values(values: unknown) {
          inserts.push({ table, values });

          if (table === crowdReportRateLimitsTable) {
            return {
              onConflictDoUpdate(config: unknown) {
                conflictUpdates.push(config);
                return {
                  returning() {
                    return Promise.resolve([
                      { submissionCount: rateLimitCount },
                    ]);
                  },
                };
              },
            };
          }

          return Promise.resolve();
        },
      };
    },
  };

  return {
    inserts,
    conflictUpdates,
    db: {
      transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
        return callback(tx);
      },
    },
  };
}

function makeFakeAutomoderationDb(
  selectResults: unknown[][],
  updatedReport: {
    id: string;
    status: 'accepted' | 'duplicate';
    duplicateOfId: string | null;
  },
) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const nextSelectResult = () => selectResults.shift() ?? [];
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
    limit() {
      return Promise.resolve(nextSelectResult());
    },
  };

  const tx = {
    select() {
      return selectBuilder;
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
    insert(table: unknown) {
      return {
        values(values: unknown) {
          inserts.push({ table, values });
          return Promise.resolve();
        },
      };
    },
  };

  return {
    inserts,
    updates,
    db: {
      transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
        return callback(tx);
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseCrowdReportJsonBody', () => {
  it('parses valid streaming JSON without relying on content-length', async () => {
    await expect(
      parseCrowdReportJsonBody(makeStreamingRequest('{"text":"hello"}')),
    ).resolves.toEqual({
      success: true,
      body: { text: 'hello' },
    });
  });

  it('rejects streaming bodies that exceed the byte limit', async () => {
    await expect(
      parseCrowdReportJsonBody(makeStreamingRequest('{"text":"hello"}'), 8),
    ).resolves.toEqual({
      success: false,
      status: 413,
      error: 'Request body is too large',
    });
  });

  it('rejects invalid streaming JSON', async () => {
    await expect(
      parseCrowdReportJsonBody(makeStreamingRequest('{"text":')),
    ).resolves.toEqual({
      success: false,
      status: 400,
      error: 'Request body must be valid JSON',
    });
  });
});

describe('validateCrowdReportSubmission', () => {
  it('normalizes a valid report submission', () => {
    const result = validateCrowdReportSubmission(
      {
        observedAt: '2026-05-24T12:30:00+08:00',
        lineIds: ['BPLRT', 'BPLRT'],
        stationIds: ['BP6'],
        text: '  Train stalled near the platform for several minutes.  ',
        directionText: '  Towards Choa Chu Kang  ',
        effect: 'delay',
        delayMinutes: 10,
        isStillHappening: true,
      },
      NOW,
    );

    expect(result).toEqual({
      success: true,
      data: VALID_SUBMISSION,
    });
  });

  it('defaults observed time to now in Singapore time', () => {
    const result = validateCrowdReportSubmission(
      {
        lineIds: ['BPLRT'],
        text: 'Train stalled near the platform for several minutes.',
      },
      NOW,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.observedAt).toBe('2026-05-24T12:34:00.000+08:00');
    }
  });

  it('requires at least one affected line or station', () => {
    const result = validateCrowdReportSubmission(
      {
        text: 'Train stalled near the platform for several minutes.',
      },
      NOW,
    );

    expect(result).toEqual({
      success: false,
      issues: ['At least one affected line or station is required'],
    });
  });

  it('accepts crowd-report effect values from the ingest contract', () => {
    const result = validateCrowdReportSubmission(
      {
        lineIds: ['BPLRT'],
        text: 'No train service is available at the station right now.',
        effect: 'no-service',
      },
      NOW,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.effect).toBe('no-service');
    }
  });

  it('rejects stale observed times', () => {
    const result = validateCrowdReportSubmission(
      {
        observedAt: '2026-05-23T11:00:00+08:00',
        lineIds: ['BPLRT'],
        text: 'Train stalled near the platform for several minutes.',
      },
      NOW,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContain('observedAt cannot be more than 24h old');
    }
  });
});

describe('verifyTurnstileToken', () => {
  it('returns a controlled failure when the verification request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network unavailable')),
    );

    await expect(
      verifyTurnstileToken('secret', 'token', '203.0.113.1'),
    ).resolves.toEqual({
      success: false,
      outcome: 'failed',
      error: 'Turnstile verification request failed',
    });
  });

  it('returns a controlled failure when the verification response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not json', {
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );

    await expect(
      verifyTurnstileToken('secret', 'token', '203.0.113.1'),
    ).resolves.toEqual({
      success: false,
      outcome: 'failed',
      error: 'Turnstile verification failed',
    });
  });

  it('rejects successful Turnstile responses with the wrong hostname', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          success: true,
          hostname: 'other.example.com',
          action: 'crowd-report',
        }),
      ),
    );

    await expect(
      verifyTurnstileToken('secret', 'token', '203.0.113.1', {
        expectedHostname: 'mrtdown.local',
        expectedAction: 'crowd-report',
      }),
    ).resolves.toEqual({
      success: false,
      outcome: 'failed',
      error: 'Turnstile verification hostname mismatch',
    });
  });

  it('rejects successful Turnstile responses with the wrong action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          success: true,
          hostname: 'mrtdown.local',
          action: 'other-flow',
        }),
      ),
    );

    await expect(
      verifyTurnstileToken('secret', 'token', '203.0.113.1', {
        expectedHostname: 'mrtdown.local',
        expectedAction: 'crowd-report',
      }),
    ).resolves.toEqual({
      success: false,
      outcome: 'failed',
      error: 'Turnstile verification action mismatch',
    });
  });
});

describe('persistCrowdReport', () => {
  it('records the report, affected entities, abuse metadata, and audit event', async () => {
    const fake = makeFakeDb(1);

    const result = await persistCrowdReport(
      fake.db as never,
      VALID_SUBMISSION,
      {
        ipHash: 'ip-hash',
        userAgentHash: 'ua-hash',
        clientFingerprintHash: 'fp-hash',
        turnstileTokenHash: 'token-hash',
        turnstileOutcome: 'passed',
      },
      {
        now: NOW,
        idFactory: () => 'fixed-id',
      },
    );

    expect(result).toEqual({ id: 'fixed-id', status: 'pending' });
    expect(fake.inserts.map((insert) => insert.table)).toEqual([
      crowdReportRateLimitsTable,
      crowdReportsTable,
      crowdReportLinesTable,
      crowdReportStationsTable,
      crowdReportAbuseEventsTable,
      crowdReportModerationEventsTable,
    ]);
    expect(fake.inserts[1]?.values).toMatchObject({
      id: 'fixed-id',
      observed_at: VALID_SUBMISSION.observedAt,
      status: 'pending',
      still_happening: true,
    });
    expect(fake.inserts[4]?.values).toMatchObject({
      report_id: 'fixed-id',
      ip_hash: 'ip-hash',
      turnstile_outcome: 'passed',
      rate_limit_bucket_start_at: getCrowdReportRateLimitBucketStart(NOW),
    });
  });

  it('rejects submissions after incrementing an exceeded rate-limit bucket', async () => {
    const fake = makeFakeDb(6);

    await expect(
      persistCrowdReport(
        fake.db as never,
        VALID_SUBMISSION,
        {
          ipHash: 'ip-hash',
          turnstileOutcome: 'skipped',
        },
        {
          now: NOW,
          rateLimitPerHour: 5,
          idFactory: () => 'fixed-id',
        },
      ),
    ).rejects.toBeInstanceOf(CrowdReportRateLimitError);

    expect(fake.inserts.map((insert) => insert.table)).toEqual([
      crowdReportRateLimitsTable,
    ]);
  });

  it('preserves an existing rate-limit fingerprint when the current request has none', async () => {
    const fake = makeFakeDb(1);

    await persistCrowdReport(
      fake.db as never,
      VALID_SUBMISSION,
      {
        ipHash: 'ip-hash',
        turnstileOutcome: 'skipped',
      },
      {
        now: NOW,
        idFactory: () => 'fixed-id',
      },
    );

    expect(fake.conflictUpdates[0]).toMatchObject({
      set: {
        client_fingerprint_hash:
          crowdReportRateLimitsTable.client_fingerprint_hash,
      },
    });
  });
});

describe('automoderateCrowdReport', () => {
  it('accepts a valid report when no duplicate candidate matches', async () => {
    const fake = makeFakeAutomoderationDb([[]], {
      id: 'report-1',
      status: 'accepted',
      duplicateOfId: null,
    });

    await expect(
      automoderateCrowdReport(fake.db as never, 'report-1', VALID_SUBMISSION, {
        idFactory: () => 'event-1',
      }),
    ).resolves.toEqual({
      id: 'report-1',
      status: 'accepted',
      duplicateOfId: null,
    });

    expect(fake.updates[0]).toMatchObject({
      table: crowdReportsTable,
      values: {
        status: 'accepted',
        duplicate_of_id: null,
      },
    });
    expect(fake.inserts[0]).toMatchObject({
      table: crowdReportModerationEventsTable,
      values: {
        id: 'event-1',
        report_id: 'report-1',
        actor: 'system',
        action: 'automated_accepted',
        note: 'Report accepted by automated moderation rules',
      },
    });
  });

  it('marks a same-context report in the duplicate window as duplicate', async () => {
    const fake = makeFakeAutomoderationDb(
      [
        [{ id: 'existing-report', directionText: 'Towards Choa Chu Kang' }],
        [{ reportId: 'existing-report', lineId: 'BPLRT' }],
        [{ reportId: 'existing-report', stationId: 'BP6' }],
      ],
      {
        id: 'report-1',
        status: 'duplicate',
        duplicateOfId: 'existing-report',
      },
    );

    await expect(
      automoderateCrowdReport(fake.db as never, 'report-1', VALID_SUBMISSION, {
        idFactory: () => 'event-1',
      }),
    ).resolves.toEqual({
      id: 'report-1',
      status: 'duplicate',
      duplicateOfId: 'existing-report',
    });

    expect(fake.updates[0]).toMatchObject({
      table: crowdReportsTable,
      values: {
        status: 'duplicate',
        duplicate_of_id: 'existing-report',
      },
    });
    expect(fake.inserts[0]).toMatchObject({
      table: crowdReportModerationEventsTable,
      values: {
        action: 'automated_duplicate',
        note: 'Report automatically marked as duplicate of existing-report',
      },
    });
  });
});
