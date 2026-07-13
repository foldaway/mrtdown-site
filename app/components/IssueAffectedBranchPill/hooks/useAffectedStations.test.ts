import { describe, expect, it } from 'vitest';
import type { Station } from '~/types';
import { sortAffectedStationsByBranch } from './useAffectedStations';

function buildStation(
  id: string,
  memberships: Station['memberships'],
): Station {
  return {
    id,
    name: {
      'en-SG': id,
      'zh-Hans': null,
      ms: null,
      ta: null,
    },
    geo: { latitude: 0, longitude: 0 },
    memberships,
    townId: 'test-town',
    landmarkIds: [],
  };
}

function membership(branchId: string, sequenceOrder: number) {
  return {
    branchId,
    lineId: 'DTL',
    code: `DT${sequenceOrder + 1}`,
    startedAt: '2017-10-21',
    structureType: 'underground' as const,
    sequenceOrder,
  };
}

describe('sortAffectedStationsByBranch', () => {
  it('prefers the affected service branch over another service on the same line', () => {
    const stations = [
      buildStation('BKP', [
        membership('DTL_MAIN_E', 0),
        membership('DTL_MAIN_W', 34),
      ]),
      buildStation('CSW', [
        membership('DTL_MAIN_E', 1),
        membership('DTL_MAIN_W', 33),
      ]),
      buildStation('XPO', [
        membership('DTL_MAIN_W', 0),
        membership('DTL_MAIN_E', 34),
      ]),
    ];

    expect(
      sortAffectedStationsByBranch(stations, {
        branchId: 'DTL_MAIN_E',
        lineId: 'DTL',
      }).map((station) => station.id),
    ).toEqual(['BKP', 'CSW', 'XPO']);
  });

  it('falls back to another service membership on the same line', () => {
    const stations = [
      buildStation('XPO', [membership('DTL_MAIN_W', 0)]),
      buildStation('CSW', [membership('DTL_MAIN_W', 33)]),
    ];

    expect(
      sortAffectedStationsByBranch(stations, {
        branchId: 'legacy-service',
        lineId: 'DTL',
      }).map((station) => station.id),
    ).toEqual(['XPO', 'CSW']);
  });
});
