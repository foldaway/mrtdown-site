import { describe, expect, it } from 'vitest';
import {
  authenticateCrowdReportProducer,
  hashProgrammaticCrowdReportPayload,
  isProgrammaticCrowdReportSourceAllowed,
  ProgrammaticCrowdReportRequestSchema,
} from './programmaticCrowdReports';

const PRODUCER_CONFIG = JSON.stringify({
  'reddit-monitor': {
    token: 'reddit-monitor-secret',
    sourceOrigins: ['https://www.reddit.com'],
  },
});

describe('authenticateCrowdReportProducer', () => {
  it('maps a producer-specific bearer secret to its producer policy', async () => {
    const result = await authenticateCrowdReportProducer(
      new Request('https://example.com/internal/api/crowd-reports', {
        headers: { authorization: 'Bearer reddit-monitor-secret' },
      }),
      PRODUCER_CONFIG,
    );

    expect(result).toEqual({
      success: true,
      producer: {
        id: 'reddit-monitor',
        sourceOrigins: ['https://www.reddit.com'],
      },
    });
  });

  it('rejects invalid credentials and invalid producer configuration', async () => {
    await expect(
      authenticateCrowdReportProducer(
        new Request('https://example.com/internal/api/crowd-reports', {
          headers: { authorization: 'Bearer wrong-secret-value' },
        }),
        PRODUCER_CONFIG,
      ),
    ).resolves.toMatchObject({ success: false, status: 401 });

    await expect(
      authenticateCrowdReportProducer(
        new Request('https://example.com/internal/api/crowd-reports'),
        '{invalid',
      ),
    ).resolves.toMatchObject({ success: false, status: 503 });
  });
});

describe('programmatic crowd report request contract', () => {
  it('allows configured HTTP origins and rejects public-only report fields', () => {
    const parsed = ProgrammaticCrowdReportRequestSchema.safeParse({
      externalReportId: 'post-1',
      sourceUrl: 'https://www.reddit.com/r/singapore/comments/example',
      report: {
        reportScope: 'line',
        lineIds: ['CCL'],
        stationIds: [],
        effect: 'delay',
        turnstileToken: 'not-allowed',
      },
    });

    expect(parsed.success).toBe(false);
    expect(
      isProgrammaticCrowdReportSourceAllowed(
        {
          id: 'reddit-monitor',
          sourceOrigins: ['https://www.reddit.com'],
        },
        'https://www.reddit.com/r/singapore/comments/example',
      ),
    ).toBe(true);
    expect(
      isProgrammaticCrowdReportSourceAllowed(
        {
          id: 'reddit-monitor',
          sourceOrigins: ['https://www.reddit.com'],
        },
        'https://example.com/not-allowed',
      ),
    ).toBe(false);
  });

  it('hashes semantically identical line and station sets consistently', async () => {
    const first = ProgrammaticCrowdReportRequestSchema.parse({
      externalReportId: 'post-1',
      report: {
        reportScope: 'line',
        observedAt: '2026-07-18T08:00:00+08:00',
        lineIds: ['CCL', 'EWL'],
        stationIds: ['EW1', 'CC1'],
        effect: 'delay',
      },
    });
    const reordered = ProgrammaticCrowdReportRequestSchema.parse({
      externalReportId: 'post-1',
      report: {
        reportScope: 'line',
        observedAt: '2026-07-18T08:00:00+08:00',
        lineIds: ['EWL', 'CCL', 'CCL'],
        stationIds: ['CC1', 'EW1'],
        effect: 'delay',
      },
    });

    await expect(hashProgrammaticCrowdReportPayload(first)).resolves.toBe(
      await hashProgrammaticCrowdReportPayload(reordered),
    );
  });
});
