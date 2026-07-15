import { describe, expect, it } from 'vitest';
import {
  getVisibleStationMembershipsAt,
  isStationMembershipVisibleAt,
} from './isStationMembershipVisibleAt';

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

describe('getVisibleStationMembershipsAt', () => {
  const memberships = [
    {
      code: 'EW2A',
      endedAt: '2001-01-01',
      lineId: 'EWL',
      startedAt: '1990-01-01',
    },
    { code: 'EW2', lineId: 'EWL', startedAt: '2001-01-01' },
    { code: 'EW3', lineId: 'EWL', startedAt: '2027-01-01' },
    {
      code: 'NS4',
      endedAt: '1996-02-10',
      lineId: 'NSL',
      startedAt: '1990-03-10',
    },
    { code: 'JS1', lineId: 'JRL', startedAt: '2027-01-01' },
  ];

  it('retains all future station codes', () => {
    expect(
      getVisibleStationMembershipsAt(memberships, '2026-07-16').map(
        (membership) => membership.code,
      ),
    ).toEqual(expect.arrayContaining(['EW3', 'JS1']));
  });

  it('hides a closed code when another code on its line is active', () => {
    expect(
      getVisibleStationMembershipsAt(memberships, '2026-07-16').map(
        (membership) => membership.code,
      ),
    ).not.toContain('EW2A');
  });

  it('retains a closed code when its line has no active code at the station', () => {
    expect(
      getVisibleStationMembershipsAt(memberships, '2026-07-16').map(
        (membership) => membership.code,
      ),
    ).toContain('NS4');
  });
});
