import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  buildLineSummary,
  buildUptimeGraph,
  buildOperatorUptimeGraph,
} from './lineAnalytics';
import {
  isLineOperatingNow,
  isLineFuture,
  serviceWindowForDate,
} from './serviceOperations';
import { buildIssue, REFERENCE_NOW, TEST_LINE } from './testFixtures';

describe('buildLineSummary', () => {
  it('keeps unknown service windows distinct from future and operating lines', () => {
    const referenceNow = DateTime.fromISO('2026-02-23T12:00:00+08:00');
    const holidays = new Set<string>();
    const unknownLines = [
      { ...TEST_LINE, startedAt: null },
      { ...TEST_LINE, operatingHours: undefined },
    ];
    for (const line of unknownLines) {
      expect(isLineFuture(line, referenceNow)).toBe(false);
      expect(isLineOperatingNow(line, holidays, referenceNow)).toBe(false);
      expect(serviceWindowForDate(line, referenceNow, holidays)).toBeNull();
      expect(
        buildLineSummary(line, [], 1, holidays, referenceNow),
      ).toMatchObject({
        status: 'unknown',
        uptimeRatio: null,
        totalServiceSeconds: null,
      });
      expect(buildUptimeGraph(line, [], holidays, 7).data).toEqual([]);
    }
    expect(
      buildOperatorUptimeGraph(unknownLines, {}, holidays, 7).data,
    ).toEqual([]);
    expect(
      buildLineSummary(
        { ...TEST_LINE, startedAt: '2027-01-01', operatingHours: undefined },
        [],
        1,
        holidays,
        referenceNow,
      ).status,
    ).toBe('future_service');
    expect(isLineOperatingNow(TEST_LINE, holidays, referenceNow)).toBe(true);
  });

  it('merges overlapping same-type issue durations in daily breakdowns', () => {
    const summary = buildLineSummary(
      TEST_LINE,
      [
        buildIssue('infra-1', 'infra', [
          {
            startAt: '2026-02-23T05:30:00+08:00',
            endAt: '2026-02-23T23:30:00+08:00',
            status: 'ended',
          },
        ]),
        buildIssue('infra-2', 'infra', [
          {
            startAt: '2026-02-23T05:30:00+08:00',
            endAt: '2026-02-23T23:30:00+08:00',
            status: 'ended',
          },
        ]),
      ],
      1,
      new Set(),
      REFERENCE_NOW,
    );

    expect(
      summary.breakdownByDates['2026-02-23'].breakdownByIssueTypes.infra
        ?.totalDurationSeconds,
    ).toBe(18 * 60 * 60);
    expect(
      summary.breakdownByDates['2026-02-23'].breakdownByIssueTypes.infra
        ?.intervals,
    ).toEqual([
      {
        startAt: '2026-02-23T05:30:00.000+08:00',
        endAt: '2026-02-23T23:30:00.000+08:00',
      },
    ]);
  });

  it('keeps different issue types in independent timeline intervals', () => {
    const summary = buildLineSummary(
      TEST_LINE,
      [
        buildIssue('infra-1', 'infra', [
          {
            startAt: '2026-02-23T05:30:00+08:00',
            endAt: '2026-02-23T23:30:00+08:00',
            status: 'ended',
          },
        ]),
        buildIssue('disruption-1', 'disruption', [
          {
            startAt: '2026-02-23T12:00:00+08:00',
            endAt: '2026-02-23T16:00:00+08:00',
            status: 'ended',
          },
        ]),
      ],
      1,
      new Set(),
      REFERENCE_NOW,
    );

    const day = summary.breakdownByDates['2026-02-23'];
    expect(day.breakdownByIssueTypes.infra?.intervals).toEqual([
      {
        startAt: '2026-02-23T05:30:00.000+08:00',
        endAt: '2026-02-23T23:30:00.000+08:00',
      },
    ]);
    expect(day.breakdownByIssueTypes.disruption?.intervals).toEqual([
      {
        startAt: '2026-02-23T12:00:00.000+08:00',
        endAt: '2026-02-23T16:00:00.000+08:00',
      },
    ]);
  });

  it('merges overlapping disruption windows before calculating downtime', () => {
    const summary = buildLineSummary(
      TEST_LINE,
      [
        buildIssue('disruption-1', 'disruption', [
          {
            startAt: '2026-02-23T05:30:00+08:00',
            endAt: '2026-02-23T23:30:00+08:00',
            status: 'ended',
          },
        ]),
        buildIssue('disruption-2', 'disruption', [
          {
            startAt: '2026-02-23T12:00:00+08:00',
            endAt: '2026-02-23T23:30:00+08:00',
            status: 'ended',
          },
        ]),
      ],
      1,
      new Set(),
      REFERENCE_NOW,
    );

    expect(summary.totalServiceSeconds).toBe(18 * 60 * 60);
    expect(summary.totalDowntimeSeconds).toBe(18 * 60 * 60);
    expect(summary.durationSecondsByIssueType.disruption).toBe(18 * 60 * 60);
    expect(summary.uptimeRatio).toBe(0);
  });

  it('treats lines as operating during service windows that spill into the next day', () => {
    const summary = buildLineSummary(
      {
        ...TEST_LINE,
        operatingHours: {
          weekdays: { start: '05:30', end: '00:30' },
          weekends: { start: '05:30', end: '00:30' },
        },
      },
      [],
      1,
      new Set(),
      DateTime.fromISO('2026-02-24T00:15:00', {
        zone: 'Asia/Singapore',
      }),
    );

    expect(summary.status).toBe('normal');
  });

  it('treats lines as closed after a next-day spillover service window ends', () => {
    const summary = buildLineSummary(
      {
        ...TEST_LINE,
        operatingHours: {
          weekdays: { start: '05:30', end: '00:30' },
          weekends: { start: '05:30', end: '00:30' },
        },
      },
      [],
      1,
      new Set(),
      DateTime.fromISO('2026-02-24T00:31:00', {
        zone: 'Asia/Singapore',
      }),
    );

    expect(summary.status).toBe('closed_for_day');
  });

  it('does not apply previous-day spillover before a line starts service', () => {
    const summary = buildLineSummary(
      {
        ...TEST_LINE,
        startedAt: '2026-02-24',
        operatingHours: {
          weekdays: { start: '05:30', end: '00:30' },
          weekends: { start: '05:30', end: '00:30' },
        },
      },
      [],
      1,
      new Set(),
      DateTime.fromISO('2026-02-24T00:15:00', {
        zone: 'Asia/Singapore',
      }),
    );

    expect(summary.status).toBe('closed_for_day');
  });
});
