import { describe, expect, it } from 'vitest';
import { buildScheduledStationArrivalLines } from './scheduledStationArrivals';
import {
  departure,
  display,
  result,
  scope,
} from './scheduledStationArrivals.fixture';
import { selectStationArrivalSource } from './stationArrivalSourcePolicy';

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
    expect(selectStationArrivalSource(empty)).toEqual({
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
    expect(selectStationArrivalSource(approximate)).toEqual({
      source: 'scheduled',
      reason: 'complete',
      scheduled: approximate,
    });
    const untimed = { ...empty, complete: false, untimedDepartureCount: 1 };
    expect(selectStationArrivalSource(untimed)).toEqual({
      source: 'scheduled',
      reason: 'incomplete',
      scheduled: untimed,
    });
  });

  it('returns unavailable for uncovered branches and absent artifacts', () => {
    expect(selectStationArrivalSource(gap)).toMatchObject({
      source: 'unavailable',
      reason: 'timetable-unavailable',
    });
    const noArtifact = { ...gap, serviceDays: [{ ...gapDay, attempts: [] }] };
    expect(selectStationArrivalSource(noArtifact).source).toBe('unavailable');
    const rejected = {
      ...gap,
      serviceDays: [
        {
          ...gapDay,
          rollback: {
            status: 'rejected' as const,
            review: {
              schemaVersion: 1 as const,
              documentKind: 'scheduled-timetable-rollback-review' as const,
              from: {
                manifestSha256: 'a'.repeat(64),
                snapshotSha256: 'b'.repeat(64),
              },
              to: {
                manifestSha256: 'c'.repeat(64),
                snapshotSha256: 'd'.repeat(64),
              },
              dateRange: {
                startDate: gapDay.serviceDate,
                endDate: gapDay.serviceDate,
              },
              scope,
              reviewer: 'test reviewer',
              reviewedAt: result.window.startInstant,
              reason: 'Synthetic rollback review',
            },
            selectionInstant: result.window.startInstant,
            blockers: ['rollback-from-is-not-current-selection'],
          },
        },
      ],
    };
    expect(selectStationArrivalSource(rejected)).toEqual({
      source: 'unavailable',
      reason: 'timetable-unavailable',
      scheduled: rejected,
    });
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
    expect(selectStationArrivalSource(partial)).toEqual({
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
    expect(selectStationArrivalSource(failed)).toEqual({
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
    expect(selectStationArrivalSource(missingDay).source).toBe('unavailable');
  });
});
