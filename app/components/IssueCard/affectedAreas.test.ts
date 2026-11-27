import { describe, expect, it } from 'vitest';
import type { IssueAffectedBranch, Line, Station } from '~/types';
import { getAffectedLineAreas } from './affectedAreas';

const referenceAt = '2025-05-25T08:00:00+08:00';
const revision = (id: string, stationIds: string[]) => ({
  id,
  startAt: '2025-01-01',
  endAt: null,
  updatedAt: '2025-01-01T00:00:00Z',
  stationIds,
  isLoop: false,
});

function line(id: string, serviceIds: string[], complete = true): Line {
  return {
    id,
    name: { 'en-SG': id, 'zh-Hans': null, ms: null, ta: null },
    type: 'mrt.high',
    color: '#000000',
    startedAt: '2025-01-01',
    platformDoorCount: null,
    trainCarCounts: [],
    operators: [],
    serviceCoverage: complete
      ? serviceIds.map((serviceId) => ({
          id: serviceId,
          revisions: [revision(`${serviceId}-r1`, [])],
        }))
      : undefined,
  };
}

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

function wholeBranch(
  lineId: string,
  branchId: string,
  stationIds: string[],
): IssueAffectedBranch {
  return {
    lineId,
    branchId,
    stationIds,
    wholeServiceRevisions: [revision(`${branchId}-r1`, stationIds)],
  };
}

describe('getAffectedLineAreas', () => {
  const stations = {
    A: station('A', [
      ['L1', 'S1', 0],
      ['L1', 'S2', 2],
    ]),
    B: station('B', [
      ['L1', 'S1', 1],
      ['L1', 'S2', 1],
      ['L2', 'S3', 0],
    ]),
    C: station('C', [
      ['L1', 'S1', 2],
      ['L1', 'S2', 0],
      ['L2', 'S3', 1],
    ]),
    D: station('D', [['L2', 'S3', 2]]),
  };

  it('marks only the explicitly covered line as whole in a mixed issue', () => {
    const areas = getAffectedLineAreas(
      [
        wholeBranch('L1', 'S1', ['A', 'B', 'C']),
        wholeBranch('L1', 'S2', ['C', 'B', 'A']),
        { lineId: 'L2', branchId: 'S3', stationIds: ['C', 'B'] },
      ],
      { L1: line('L1', ['S1', 'S2']), L2: line('L2', ['S3', 'S4']) },
      stations,
      referenceAt,
    );

    expect(areas.map(({ lineId, wholeLine }) => [lineId, wholeLine])).toEqual([
      ['L1', true],
      ['L2', false],
    ]);
    expect(areas[1].branches[0].stationIds).toEqual(['B', 'C']);
  });

  it('does not promote one entire service to an entire line', () => {
    const [area] = getAffectedLineAreas(
      [wholeBranch('L1', 'S1', ['A', 'B', 'C'])],
      { L1: line('L1', ['S1', 'S2']) },
      stations,
      referenceAt,
    );
    expect(area.wholeLine).toBe(false);
    expect(area.branches[0].coverage).toBe('whole-service');
  });

  it('does not claim whole-line coverage without complete topology', () => {
    const [area] = getAffectedLineAreas(
      [wholeBranch('L1', 'S1', ['A', 'B', 'C'])],
      { L1: line('L1', [], false) },
      stations,
      referenceAt,
    );
    expect(area.wholeLine).toBe(false);
  });

  it('uses a factual fallback when the selected service revision is missing', () => {
    const [area] = getAffectedLineAreas(
      [
        {
          ...wholeBranch('L1', 'S1', ['A', 'B']),
          wholeServiceRevisions: [
            { ...revision('S1-old', ['A', 'B']), endAt: '2025-02-01' },
          ],
        },
      ],
      { L1: line('L1', ['S1']) },
      stations,
      referenceAt,
    );
    expect(area.wholeLine).toBe(false);
    expect(area.branches[0].coverage).toBe('unknown');
    expect(area.branches[0].stationIds).toEqual([]);
  });

  it('keeps distinct partial paths as separate areas', () => {
    const [area] = getAffectedLineAreas(
      [
        { lineId: 'L1', branchId: 'S1', stationIds: ['A', 'B'] },
        { lineId: 'L1', branchId: 'S2', stationIds: ['B', 'A'] },
        { lineId: 'L1', branchId: 'S3', stationIds: ['A', 'C'] },
      ],
      { L1: line('L1', ['S1', 'S2', 'S3']) },
      stations,
      referenceAt,
    );
    expect(area.areas).toHaveLength(2);
    expect(area.areas[0].branches).toHaveLength(2);
    expect(area.areas[1].branches).toHaveLength(1);
  });

  it('keeps opposite loop services distinct within one geographic area', () => {
    const loopLine = line('L1', ['S1', 'S2']);
    for (const service of loopLine.serviceCoverage ?? []) {
      service.revisions[0].isLoop = true;
    }
    const [area] = getAffectedLineAreas(
      [
        { lineId: 'L1', branchId: 'S1', stationIds: ['A', 'B'] },
        { lineId: 'L1', branchId: 'S2', stationIds: ['B', 'A'] },
      ],
      { L1: loopLine },
      stations,
      referenceAt,
    );
    expect(area.areas).toHaveLength(1);
    expect(area.areas[0].branches).toHaveLength(2);
    expect(area.branches.map((branch) => branch.isLoop)).toEqual([true, true]);
  });

  it('treats both City Hall–Raffles Place scopes as one segment', () => {
    const cityHall = station('CTH', [
      ['EWL', 'EWL_MAIN_E', 1],
      ['EWL', 'EWL_MAIN_W', 2],
    ]);
    const rafflesPlace = station('RFP', [
      ['EWL', 'EWL_MAIN_E', 2],
      ['EWL', 'EWL_MAIN_W', 1],
    ]);
    const [area] = getAffectedLineAreas(
      [
        {
          lineId: 'EWL',
          branchId: 'EWL_MAIN_E',
          stationIds: ['CTH', 'RFP'],
        },
        {
          lineId: 'EWL',
          branchId: 'EWL_MAIN_W',
          stationIds: ['RFP', 'CTH'],
        },
      ],
      { EWL: line('EWL', ['EWL_MAIN_E', 'EWL_MAIN_W']) },
      { CTH: cityHall, RFP: rafflesPlace },
      referenceAt,
    );
    expect(area.areas).toHaveLength(1);
    expect(area.areas[0].stationIds).toEqual(['CTH', 'RFP']);
  });

  it('groups the real City Hall and Raffles Place facility points as one adjacent area', () => {
    const cityHall = station('CTH', [
      ['EWL', 'EWL_MAIN_E', 13],
      ['EWL', 'EWL_MAIN_W', 14],
    ]);
    const rafflesPlace = station('RFP', [
      ['EWL', 'EWL_MAIN_E', 14],
      ['EWL', 'EWL_MAIN_W', 13],
    ]);
    const [area] = getAffectedLineAreas(
      [
        { lineId: 'EWL', branchId: 'EWL:CTH', stationIds: ['CTH'] },
        { lineId: 'EWL', branchId: 'EWL:RFP', stationIds: ['RFP'] },
      ],
      { EWL: line('EWL', ['EWL_MAIN_E', 'EWL_MAIN_W']) },
      { CTH: cityHall, RFP: rafflesPlace },
      referenceAt,
    );
    expect(area.areas).toHaveLength(1);
    expect(area.areas[0].kind).toBe('station-points');
    expect(area.areas[0].stationIds).toEqual(['CTH', 'RFP']);
  });

  it('does not turn two disjoint stretches into one continuous range', () => {
    const [area] = getAffectedLineAreas(
      [
        {
          lineId: 'L1',
          branchId: 'S1',
          stationIds: ['A', 'B', 'D'],
          stationStretches: [['A', 'B'], ['D']],
        },
      ],
      { L1: line('L1', ['S1']) },
      stations,
      referenceAt,
    );
    expect(area.areas.map((part) => part.stationIds)).toEqual([
      ['A', 'B'],
      ['D'],
    ]);
  });

  it('preserves an explicit stretch crossing the end of a loop', () => {
    const [area] = getAffectedLineAreas(
      [
        {
          lineId: 'L1',
          branchId: 'S1',
          stationIds: ['A', 'C'],
          stationStretches: [['C', 'A']],
        },
      ],
      { L1: line('L1', ['S1']) },
      stations,
      referenceAt,
    );
    expect(area.areas[0].stationIds).toEqual(['C', 'A']);
  });
});
