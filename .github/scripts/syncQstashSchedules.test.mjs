import { describe, expect, it, vi } from 'vitest';
import {
  buildManagedSchedules,
  buildScheduleRequest,
  parseDeploymentTier,
  syncManagedSchedules,
} from './syncQstashSchedules.mjs';

describe('QStash schedule synchronization', () => {
  it('builds deterministic production schedules for all recurring jobs', () => {
    const schedules = buildManagedSchedules({
      tier: 'production',
      rootUrl: 'https://www.mrtdown.org/some-path',
      internalApiToken: 'schedule-secret',
    });

    expect(schedules).toMatchObject([
      {
        scheduleId: 'mrtdown-production-pull',
        destination: 'https://www.mrtdown.org/internal/api/workflows/pull',
        cron: '0 0,6,12,18 * * *',
      },
      {
        scheduleId: 'mrtdown-production-public-holidays',
        destination:
          'https://www.mrtdown.org/internal/api/workflows/publicHolidays',
        cron: '0 18 * * SUN',
      },
      {
        scheduleId: 'mrtdown-production-crowd-report-dispatch',
        destination:
          'https://www.mrtdown.org/internal/api/tasks/crowd-report-dispatch',
        headers: { Authorization: 'Bearer schedule-secret' },
        redactHeaders: ['Authorization'],
      },
    ]);
  });

  it('builds an idempotent QStash API request with forwarded secrets', () => {
    const schedules = buildManagedSchedules({
      tier: 'staging',
      rootUrl: 'https://staging.mrtdown.org',
      internalApiToken: 'schedule-secret',
    });
    const pullRequest = buildScheduleRequest(schedules[0], {
      qstashUrl: 'https://qstash.example.test/',
      qstashToken: 'qstash-secret',
    });

    expect(pullRequest.url).toBe(
      'https://qstash.example.test/v2/schedules/https://staging.mrtdown.org/internal/api/workflows/pull',
    );
    expect(pullRequest.init.headers.get('Authorization')).toBe(
      'Bearer qstash-secret',
    );
    expect(pullRequest.init.headers.get('Upstash-Schedule-Id')).toBe(
      'mrtdown-staging-pull',
    );
    expect(pullRequest.init.headers.get('Upstash-Flow-Control-Value')).toBe(
      'parallelism=1',
    );

    const dispatchRequest = buildScheduleRequest(schedules[2], {
      qstashUrl: 'https://qstash.example.test',
      qstashToken: 'qstash-secret',
    });
    expect(
      dispatchRequest.init.headers.get('Upstash-Forward-Authorization'),
    ).toBe('Bearer schedule-secret');
    expect(dispatchRequest.init.headers.get('Upstash-Redact-Fields')).toBe(
      'header[Authorization]',
    );
  });

  it('upserts every managed schedule', async () => {
    const schedules = buildManagedSchedules({
      tier: 'preview',
      rootUrl: 'https://preview.mrtdown.org',
      internalApiToken: 'schedule-secret',
    });
    const fetchImplementation = vi.fn(async (_url, init) =>
      Response.json({
        scheduleId: init.headers.get('Upstash-Schedule-Id'),
      }),
    );

    await expect(
      syncManagedSchedules(
        schedules,
        {
          qstashUrl: 'https://qstash.example.test',
          qstashToken: 'qstash-secret',
        },
        fetchImplementation,
      ),
    ).resolves.toEqual([
      'mrtdown-preview-pull',
      'mrtdown-preview-public-holidays',
      'mrtdown-preview-crowd-report-dispatch',
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it('rejects unknown deployment tiers', () => {
    expect(() => parseDeploymentTier('develop')).toThrow(
      'TIER must be one of: preview, staging, production',
    );
  });
});
