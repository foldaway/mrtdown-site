import { describe, expect, it } from 'vitest';
import { isStationMembershipVisibleAt } from './isStationMembershipVisibleAt';

describe('isStationMembershipVisibleAt', () => {
  it('keeps current memberships visible', () => {
    expect(
      isStationMembershipVisibleAt({ startedAt: '2020-01-01' }, '2026-07-14'),
    ).toBe(true);
  });

  it('hides memberships before their start date', () => {
    expect(
      isStationMembershipVisibleAt({ startedAt: '2026-07-15' }, '2026-07-14'),
    ).toBe(false);
  });

  it('shows memberships on their start date', () => {
    expect(
      isStationMembershipVisibleAt(
        { startedAt: '2026-07-14' },
        '2026-07-14T00:00:00+08:00',
      ),
    ).toBe(true);
  });

  it('keeps ended memberships visible before their end date', () => {
    expect(
      isStationMembershipVisibleAt(
        { startedAt: '2010-01-01', endedAt: '2026-07-14' },
        '2020-01-01T12:00:00+08:00',
      ),
    ).toBe(true);
  });

  it('hides memberships on and after their end date', () => {
    const membership = {
      startedAt: '2010-01-01',
      endedAt: '2026-07-14',
    };

    expect(
      isStationMembershipVisibleAt(membership, '2026-07-14T00:00:00+08:00'),
    ).toBe(false);
    expect(isStationMembershipVisibleAt(membership, '2026-07-15')).toBe(false);
  });

  it('evaluates timestamp references in Singapore time', () => {
    expect(
      isStationMembershipVisibleAt(
        { startedAt: '2010-01-01', endedAt: '2026-07-14' },
        '2026-07-13T16:30:00Z',
      ),
    ).toBe(false);
  });
});
