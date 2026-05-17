import { describe, expect, it } from 'vitest';
import { issueTypeHasLineDowntimeByServiceEffect } from './issueOperationalEffects';

describe('issueTypeHasLineDowntimeByServiceEffect', () => {
  it('always counts disruptions as line downtime', () => {
    expect(issueTypeHasLineDowntimeByServiceEffect('disruption', [])).toBe(true);
  });

  it('counts maintenance no-service windows as downtime', () => {
    expect(
      issueTypeHasLineDowntimeByServiceEffect('maintenance', ['no-service']),
    ).toBe(true);
  });

  it('counts maintenance service-hours adjustments as downtime', () => {
    expect(
      issueTypeHasLineDowntimeByServiceEffect('maintenance', [
        'service-hours-adjustment',
      ]),
    ).toBe(true);
  });

  it('counts infra reduced-service windows as downtime', () => {
    expect(
      issueTypeHasLineDowntimeByServiceEffect('infra', ['reduced-service']),
    ).toBe(true);
  });

  it('does not count line issues that only report delays', () => {
    expect(
      issueTypeHasLineDowntimeByServiceEffect('maintenance', ['delay']),
    ).toBe(false);
  });

  it('does not count issues without a service-impacting effect', () => {
    expect(issueTypeHasLineDowntimeByServiceEffect('infra', [])).toBe(false);
  });
});
