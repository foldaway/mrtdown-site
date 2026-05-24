import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  crowdReportAbuseEventsTable,
  crowdReportLinesTable,
  crowdReportModerationEventsTable,
  crowdReportRateLimitsTable,
  crowdReportsTable,
  crowdReportStationsTable,
} from '~/db/schema';
import {
  CrowdReportRateLimitError,
  getCrowdReportRateLimitBucketStart,
  persistCrowdReport,
  validateCrowdReportSubmission,
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

function makeFakeDb(rateLimitCount: number) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const tx = {
    insert(table: unknown) {
      return {
        values(values: unknown) {
          inserts.push({ table, values });

          if (table === crowdReportRateLimitsTable) {
            return {
              onConflictDoUpdate() {
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
    db: {
      transaction<T>(callback: (transaction: typeof tx) => Promise<T>) {
        return callback(tx);
      },
    },
  };
}

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
});
