import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { buildLineSummary } from './lineAnalytics';
import { buildIssue, REFERENCE_NOW, TEST_LINE } from './testFixtures';

describe('buildLineSummary', () => {
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
