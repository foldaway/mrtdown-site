import { describe, expect, it } from 'vitest';
import { isCrowdReportsFeatureEnabled } from './crowdReportFeatureFlag';

describe('isCrowdReportsFeatureEnabled', () => {
  it('defaults to disabled in production', () => {
    expect(isCrowdReportsFeatureEnabled({ TIER: 'production' })).toBe(false);
  });

  it('defaults to enabled outside production', () => {
    expect(isCrowdReportsFeatureEnabled({ TIER: 'staging' })).toBe(true);
    expect(isCrowdReportsFeatureEnabled({ TIER: 'preview' })).toBe(true);
  });

  it('defaults to enabled in local development', () => {
    expect(isCrowdReportsFeatureEnabled({}, { isLocalDev: true })).toBe(true);
  });

  it('defaults to disabled when the runtime tier is not declared', () => {
    expect(isCrowdReportsFeatureEnabled({})).toBe(false);
  });

  it('allows an explicit runtime override', () => {
    expect(
      isCrowdReportsFeatureEnabled({
        CROWD_REPORTS_ENABLED: 'true',
        TIER: 'production',
      }),
    ).toBe(true);
    expect(
      isCrowdReportsFeatureEnabled({
        CROWD_REPORTS_ENABLED: 'false',
        TIER: 'staging',
      }),
    ).toBe(false);
    expect(
      isCrowdReportsFeatureEnabled(
        {
          CROWD_REPORTS_ENABLED: 'false',
        },
        { isLocalDev: true },
      ),
    ).toBe(false);
  });
});
