import { describe, expect, it } from 'vitest';
import { buildScheduledStationArrivalLines } from './scheduledStationArrivals';
import {
  departure,
  display,
  result,
  scope,
} from './scheduledStationArrivals.fixture';
import {
  type FrequencyArrivalCandidate,
  selectStationArrivalSource,
} from './stationArrivalSourcePolicy';

const frequency: FrequencyArrivalCandidate = {
  stationId: scope.stationId,
  window: result.window,
  timing: {
    ...scope,
    serviceName: display.serviceName,
    destinationCode: display.destinationCode,
    destinationName: display.destinationName,
    platformLabels: ['Platform'],
    firstTrainTime: null,
    lastTrainTime: null,
    isServiceEnded: false,
    nextServiceStart: null,
    departures: [
      {
        time: departure.departureInstant,
        basis: 'crowd_report',
        confidence: 'medium',
        headwaySeconds: 300,
        headwayRangeSeconds: { min: 240, max: 360 },
        crowdReportCount: 1,
        crowdReportsDisagree: false,
      },
    ],
  },
};
const gapDay = {
  ...result.serviceDays[0],
  selected: null,
  attempts: [
    { manifestSha256: 'c'.repeat(64), reason: 'mapping-coverage-gap' as const },
  ],
};
const gap = buildScheduledStationArrivalLines(
  { ...result, complete: false, serviceDays: [gapDay] },
  display,
);

describe('private station arrival source policy', () => {
  it('keeps empty, approximate and untimed schedules without frequency substitution', () => {
    const empty = buildScheduledStationArrivalLines(result, display);
    expect(selectStationArrivalSource(empty, frequency)).toEqual({
      source: 'scheduled',
      reason: 'complete',
      scheduled: empty,
    });
    const approximate = buildScheduledStationArrivalLines(
      {
        ...result,
        departures: [{ ...departure, precision: 'approximate', timepoint: 0 }],
      },
      display,
    );
    expect(selectStationArrivalSource(approximate, frequency)).toEqual({
      source: 'scheduled',
      reason: 'complete',
      scheduled: approximate,
    });
    const untimed = { ...empty, complete: false, untimedDepartureCount: 1 };
    expect(selectStationArrivalSource(untimed, frequency)).toEqual({
      source: 'scheduled',
      reason: 'incomplete',
      scheduled: untimed,
    });
  });

  it('permits coverage-gap fallback only for the same canonical branch and window', () => {
    const decision = selectStationArrivalSource(gap, frequency);
    expect(decision).toEqual({
      source: 'frequency',
      reason: 'coverage-gap',
      scheduled: gap,
      frequency,
    });
    if (decision.source === 'frequency') {
      expect(decision.frequency).toBe(frequency);
    }
    const noArtifact = { ...gap, serviceDays: [{ ...gapDay, attempts: [] }] };
    expect(selectStationArrivalSource(noArtifact, frequency).source).toBe(
      'frequency',
    );
    expect(selectStationArrivalSource(gap, null).reason).toBe(
      'frequency-unavailable',
    );
    const unrelated = {
      ...frequency,
      timing: { ...frequency.timing, destinationStationId: 'another' },
    };
    expect(selectStationArrivalSource(gap, unrelated).source).toBe(
      'unavailable',
    );
    const later = {
      ...frequency,
      window: { ...frequency.window, startInstant: departure.departureInstant },
    };
    expect(selectStationArrivalSource(gap, later).source).toBe('unavailable');
    const platform = { ...gap, scope: { ...scope, platformId: 'a' } };
    expect(selectStationArrivalSource(platform, frequency).source).toBe(
      'unavailable',
    );
  });

  it('retains partial results and exposes integrity failures without mixing sources', () => {
    const partial = buildScheduledStationArrivalLines(
      {
        ...result,
        complete: false,
        departures: [departure],
        serviceDays: [
          ...result.serviceDays,
          { ...gapDay, serviceDate: '2026-10-25' },
        ],
      },
      display,
    );
    expect(selectStationArrivalSource(partial, frequency)).toEqual({
      source: 'scheduled',
      reason: 'incomplete',
      scheduled: partial,
    });
    const failed = {
      ...partial,
      unavailableProjections: [
        {
          manifestSha256: 'd'.repeat(64),
          reason: 'projection-incomplete' as const,
        },
      ],
    };
    expect(selectStationArrivalSource(failed, frequency)).toEqual({
      source: 'unavailable',
      reason: 'timetable-unavailable',
      scheduled: failed,
    });
    const missingDay = {
      ...gap,
      serviceDays: [
        {
          ...gapDay,
          attempts: [
            {
              manifestSha256: 'c'.repeat(64),
              reason: 'day-not-indexed' as const,
            },
          ],
        },
      ],
    };
    expect(selectStationArrivalSource(missingDay, frequency).source).toBe(
      'unavailable',
    );
  });
});
