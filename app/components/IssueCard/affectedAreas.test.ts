import { describe, expect, it } from 'vitest';
import type { Station } from '~/types';
import { getAffectedLineAreas } from './affectedAreas';

const at = '2025-05-25T08:00:00+08:00';

function station(id: string, memberships: Array<[string, string, number]>) {
  return {
    id,
    memberships: memberships.map(([lineId, branchId, sequenceOrder]) => ({
      lineId,
      branchId,
      sequenceOrder,
      startedAt: '2020-01-01',
    })),
  } as Pick<Station, 'id' | 'memberships'>;
}

describe('getAffectedLineAreas', () => {
  const stations = {
    A: station('A', [
      ['L', 'east', 0],
      ['L', 'west', 2],
    ]),
    B: station('B', [
      ['L', 'east', 1],
      ['L', 'west', 1],
    ]),
    C: station('C', [
      ['L', 'east', 2],
      ['L', 'west', 0],
    ]),
    D: station('D', [['L', 'east', 3]]),
  };

  it('shows opposite directions over the same segment once', () => {
    const [line] = getAffectedLineAreas(
      [
        { lineId: 'L', branchId: 'east', stationIds: ['A', 'B'] },
        { lineId: 'L', branchId: 'west', stationIds: ['B', 'A'] },
      ],
      stations,
      at,
    );
    expect(line.areas).toHaveLength(1);
    expect(line.areas[0].branches).toHaveLength(2);
  });

  it('groups adjacent facility stations but leaves gaps separate', () => {
    const [line] = getAffectedLineAreas(
      [
        { lineId: 'L', branchId: 'L:A', stationIds: ['A'] },
        { lineId: 'L', branchId: 'L:B', stationIds: ['B'] },
        { lineId: 'L', branchId: 'L:D', stationIds: ['D'] },
      ],
      stations,
      at,
    );
    expect(line.areas.map((area) => area.stationIds)).toEqual([
      ['A', 'B'],
      ['D'],
    ]);
  });

  it('keeps disjoint stretches and their explicit order', () => {
    const [line] = getAffectedLineAreas(
      [
        {
          lineId: 'L',
          branchId: 'east',
          stationIds: ['A', 'B', 'C'],
          stationStretches: [['C', 'A'], ['B']],
        },
      ],
      stations,
      at,
    );
    expect(line.areas.map((area) => area.stationIds)).toEqual([
      ['C', 'A'],
      ['B'],
    ]);
  });

  it('does not claim whole-service coverage when its revision is unavailable', () => {
    const [line] = getAffectedLineAreas(
      [
        {
          lineId: 'L',
          branchId: 'east',
          stationIds: ['A', 'B'],
          wholeServiceRevisions: [
            {
              id: 'old',
              startAt: '2020-01-01',
              endAt: '2021-01-01',
              updatedAt: '2020-01-01T00:00:00Z',
              stationIds: ['A', 'B'],
            },
          ],
        },
      ],
      stations,
      at,
    );
    expect(line.areas[0].branches[0].coverage).toBe('unknown');
  });
});
