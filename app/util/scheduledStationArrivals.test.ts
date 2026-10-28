import {
  type RetainedScheduledDeparture,
  verifyScheduledTimetableArtifact,
} from '@mrtdown/fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { queryIndexedScheduledDepartures } from './dbQueries/queryIndexedScheduledDepartures';
import {
  retentionBundle,
  retentionReview,
} from './dbQueries/scheduledTimetableRetention.fixture';
import type { EstimatedArrivalDeparture } from './estimatedArrivals';
import { buildScheduledStationArrivalLines } from './scheduledStationArrivals';

const bundle = retentionBundle();
const { manifest } = verifyScheduledTimetableArtifact(
  bundle.files['manifest.json'],
  bundle.entry.manifestSha256,
  {
    timetableBytes: bundle.files['timetable.json'],
    noticeBytes: bundle.files['NOTICE.txt'],
  },
);
const scope = {
  stationId: 'station',
  lineId: 'line',
  serviceId: 'service',
  destinationStationId: 'destination',
};
const result: Awaited<ReturnType<typeof queryIndexedScheduledDepartures>> = {
  scope,
  window: {
    startInstant: '2026-10-24T16:00:00Z',
    endInstant: '2026-10-24T17:00:00Z',
  },
  serviceDays: [
    {
      serviceDate: '2026-10-24',
      scope,
      selected: {
        projectionId: 1,
        projectorVersion: 1,
        topology: manifest.identity.topology,
        maximumDepartureSeconds: 90_000,
        completedAt: '2026-10-24T01:00:00Z',
        coverage: {
          activeTripCount: 1,
          unassignedActiveTripCount: 0,
          platformIds: ['a', 'b'],
        },
        version: {
          manifestSha256: bundle.entry.manifestSha256,
          manifest,
          record: {
            schemaVersion: 1,
            documentKind: 'scheduled-timetable-import',
            manifestSha256: bundle.entry.manifestSha256,
            predecessorSha256: null,
            importInstant: '2026-10-24T00:01:00Z',
            sourceReview: retentionReview(bundle),
          },
        },
      },
      attempts: [
        { manifestSha256: bundle.entry.manifestSha256, reason: 'eligible' },
      ],
    },
  ],
  unavailableProjections: [],
  untimedDepartureCount: 0,
  complete: true,
  departures: [],
};
const departure: RetainedScheduledDeparture = {
  ...scope,
  revisionId: 'dated-revision',
  providerTripId: '000-trip',
  providerRouteId: '000-route',
  providerCalendarId: 'calendar',
  providerStopId: '000-stop',
  stopSequence: '09007199254740993123',
  serviceDate: '2026-10-24',
  platformIds: ['b', 'a'],
  arrivalSeconds: 87_000,
  departureSeconds: 87_000,
  arrivalInstant: '2026-10-24T16:10:00Z',
  departureInstant: '2026-10-24T16:10:00Z',
  pickupType: 0,
  dropOffType: 0,
  timepoint: 1,
  basis: 'scheduled',
  precision: 'exact',
  manifestSha256: bundle.entry.manifestSha256,
  snapshotSha256: manifest.capture.sha256,
  retrievedAt: manifest.capture.retrieved_at,
  correctionRevision: 1,
};
const display = {
  serviceName: { 'en-SG': 'Service', 'zh-Hans': null, ms: null, ta: null },
  destinationCode: 'D1',
  destinationName: {
    'en-SG': 'Destination',
    'zh-Hans': null,
    ms: null,
    ta: null,
  },
  // Shared labels must never merge distinct canonical platforms.
  platformLabelsById: new Map([
    ['a', 'Platform'],
    ['b', 'Platform'],
  ]),
};

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
    expectTypeOf(
      alternatives.departures[0],
    ).not.toExtend<EstimatedArrivalDeparture>();
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
