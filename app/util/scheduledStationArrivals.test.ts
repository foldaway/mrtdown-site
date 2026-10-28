import { describe, expect, it } from 'vitest';
import {
  departure,
  display,
  result,
  scope,
} from './scheduledStationArrivals.fixture';
import { buildScheduledStationArrivalLines } from './scheduledStationArrivals';

describe('scheduled station arrivals adapter', () => {
  it('preserves scheduled precision, provenance and query order within platform groups', () => {
    const repeated = {
      ...departure,
      platformIds: ['a', 'b'],
      stopSequence: '09007199254740993125',
      timepoint: 0 as const,
      precision: 'approximate' as const,
    };
    const departures = [
      departure,
      {
        ...departure,
        platformIds: ['a'],
        stopSequence: '09007199254740993124',
      },
      repeated,
    ];
    const input = { ...result, departures };
    const before = structuredClone(input);
    const arrivals = buildScheduledStationArrivalLines(input, display);
    const [alternatives, single] = arrivals.lines[0].arrivalTimings;

    expect(arrivals.basis).toBe('scheduled');
    expect(arrivals.lines[0].lineId).toBe(scope.lineId);
    expect(alternatives).toMatchObject({
      ...scope,
      serviceName: display.serviceName,
      destinationCode: 'D1',
      destinationName: display.destinationName,
      platformIds: ['a', 'b'],
      platformLabels: ['Platform', 'Platform'],
    });
    expect(alternatives.departures).toEqual(
      [departure, repeated].map((item) => ({
        ...item,
        time: item.departureInstant,
      })),
    );
    expect(single.platformIds).toEqual(['a']);
    expect(single.departures).toHaveLength(1);
    expect(arrivals.lines[0].arrivalTimings).toHaveLength(2);
    expect(alternatives.departures[0]).not.toHaveProperty('headwaySeconds');
    expect(input).toEqual(before);
  });

  it('retains authoritative empty coverage without inventing service-day bounds', () => {
    const empty = structuredClone(result);
    const selected = empty.serviceDays[0].selected;
    if (!selected) {
      throw new Error('Missing fixture selection');
    }
    selected.coverage.activeTripCount = 0;
    const arrivals = buildScheduledStationArrivalLines(empty, display);
    const { departures: _departures, ...coverage } = empty;
    expect(arrivals).toStrictEqual({
      ...coverage,
      basis: 'scheduled',
      lines: [{ lineId: scope.lineId, arrivalTimings: [] }],
    });
    expect(arrivals.complete).toBe(true);
    expect(arrivals.serviceDays[0].selected?.coverage.activeTripCount).toBe(0);
  });

  it('preserves incomplete empty coverage and every query reason', () => {
    const incomplete = {
      ...result,
      complete: false,
      untimedDepartureCount: 2,
      serviceDays: [
        {
          ...result.serviceDays[0],
          selected: null,
          attempts: [
            {
              manifestSha256: 'c'.repeat(64),
              reason: 'day-not-indexed' as const,
            },
          ],
        },
      ],
      unavailableProjections: [
        {
          manifestSha256: 'd'.repeat(64),
          reason: 'projection-incomplete' as const,
        },
      ],
    };
    const arrivals = buildScheduledStationArrivalLines(incomplete, display);
    expect(arrivals.complete).toBe(false);
    expect(arrivals.untimedDepartureCount).toBe(2);
    expect(arrivals.serviceDays).toEqual(incomplete.serviceDays);
    expect(arrivals.unavailableProjections).toEqual(
      incomplete.unavailableProjections,
    );
    expect(arrivals.lines[0].arrivalTimings).toEqual([]);
  });
});
