import { describe, expect, it } from 'vitest';
import {
  loopPlatformViaStations,
  loopViaStationId,
} from './stationArrivalBranches';

describe('loop arrival direction labels', () => {
  const path = ['CCK', 'PNX', 'BKP', 'SNJ', 'PTR', 'BKP', 'PNX', 'CCK'].map(
    (stationId) => ({ stationId }),
  );

  it('omits a branch-wide via where outbound and return visits disagree', () => {
    expect(loopViaStationId(path, 'BKP')).toBeUndefined();
    expect(loopViaStationId(path, 'PNX')).toBeUndefined();
  });

  it('keeps the direction for a unique boarding visit, including the loop anchor', () => {
    expect(loopViaStationId(path, 'CCK')).toBe('PNX');
    expect(loopViaStationId(path, 'SNJ')).toBe('PTR');
    expect(loopViaStationId(path, 'unknown')).toBeUndefined();
  });

  it('identifies the outbound platform separately from the returning visit', () => {
    expect(loopPlatformViaStations(path, 'BPLRT_A', 'BKP')).toEqual([
      { platformId: 'BKP_BPLRT_2', stationId: 'SNJ' },
    ]);
    const serviceB = [
      'CCK',
      'PNX',
      'BKP',
      'PTR',
      'SNJ',
      'BKP',
      'PNX',
      'CCK',
    ].map((stationId) => ({ stationId }));
    expect(loopPlatformViaStations(serviceB, 'BPLRT_B', 'BKP')).toEqual([
      { platformId: 'BKP_BPLRT_2', stationId: 'PTR' },
    ]);
  });

  it('does not apply the allocation to unknown or changed routes', () => {
    expect(loopPlatformViaStations(path, 'other-service', 'BKP')).toEqual([]);
    expect(loopPlatformViaStations(path, 'BPLRT_A', 'PNX')).toEqual([]);
    expect(
      loopPlatformViaStations(path.slice(0, -1), 'BPLRT_A', 'BKP'),
    ).toEqual([]);
    expect(
      loopPlatformViaStations(path.toReversed(), 'BPLRT_A', 'BKP'),
    ).toEqual([]);
  });
});
