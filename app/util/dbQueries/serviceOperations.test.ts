import { describe, expect, it } from 'vitest';
import { resolveStationMembershipEndedAt } from './serviceOperations';

describe('resolveStationMembershipEndedAt', () => {
  it('exposes an end date on its exclusive boundary', () => {
    expect(resolveStationMembershipEndedAt('2026-07-12', '2026-07-12')).toBe(
      '2026-07-12',
    );
  });

  it('does not expose a future end date as a closure', () => {
    expect(
      resolveStationMembershipEndedAt('2026-07-13', '2026-07-12'),
    ).toBeUndefined();
  });
});
