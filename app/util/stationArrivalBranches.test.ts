import { describe, expect, it } from 'vitest';
import {
  loopPlatformViaStations,
  loopViaStationId,
  nonLoopViaStationIds,
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

describe('non-loop arrival waypoints', () => {
  const branch = (id: string, stations: string[], lineId = 'line') => ({
    id,
    lineId,
    entries: stations.map((stationId) => ({ stationId })),
  });
  const routes = [
    branch('a', ['start', 'here', 'junction', 'via-a', 'rejoin', 'end']),
    branch('b', ['start', 'here', 'junction', 'via-b', 'rejoin', 'end']),
  ];

  it('selects a distinguishing intermediate station on each remaining route', () => {
    expect([...nonLoopViaStationIds(routes, 'here')]).toEqual([
      ['a', 'via-a'],
      ['b', 'via-b'],
    ]);
    expect(nonLoopViaStationIds(routes, 'rejoin').size).toBe(0);
    expect(nonLoopViaStationIds(routes, 'end').size).toBe(0);
  });

  it('omits redundant waypoints for a single route, identical paths or different termini/lines', () => {
    for (const paths of [
      [routes[0]],
      [routes[0], { ...routes[0], id: 'same-path' }],
      [routes[0], branch('b', ['here', 'via-b', 'other-end'])],
      [routes[0], { ...routes[1], lineId: 'other-line' }],
    ])
      expect(nonLoopViaStationIds(paths, 'here').size).toBe(0);
  });

  it('leaves loops and ambiguous repeated station visits to their own direction rules', () => {
    expect(
      nonLoopViaStationIds(
        [
          routes[0],
          branch('loop', ['end', 'here', 'via-b', 'end']),
          branch('repeat', ['start', 'here', 'via-b', 'here', 'end']),
        ],
        'here',
      ).size,
    ).toBe(0);
  });
});
