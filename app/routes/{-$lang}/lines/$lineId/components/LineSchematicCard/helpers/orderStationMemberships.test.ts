import { describe, expect, it } from 'vitest';
import { orderStationMemberships } from './orderStationMemberships';

const memberships = [
  { code: 'JS1', lineId: 'JRL' },
  { code: 'BP1', lineId: 'BPLRT' },
  { code: 'NS4', lineId: 'NSL' },
];

describe('orderStationMemberships', () => {
  it('puts the current line innermost on the right', () => {
    expect(
      orderStationMemberships(memberships, 'JRL', 'right').map(
        (membership) => membership.code,
      ),
    ).toEqual(['JS1', 'BP1', 'NS4']);
  });

  it('reverses codes on the left so the current line remains innermost', () => {
    expect(
      orderStationMemberships(memberships, 'JRL', 'left').map(
        (membership) => membership.code,
      ),
    ).toEqual(['NS4', 'BP1', 'JS1']);
  });
});
