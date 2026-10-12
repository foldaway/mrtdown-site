import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { buildIssue, TEST_LINE } from './dbQueries/testFixtures';
import { buildWeeklySummary, getReportWeek, REPORT_ZONE } from './weeklyReport';

const start = DateTime.fromISO('2026-10-05', { zone: REPORT_ZONE });
const end = start.plus({ weeks: 1 });
const now = end.plus({ days: 1 });
const interval = (startAt: string, endAt: string | null) => ({
  startAt,
  endAt,
  status: 'ended' as const,
});

describe('weekly reports', () => {
  it('accepts Monday weeks and rejects malformed, non-Monday, or future dates', () => {
    expect(getReportWeek('2026-10-05', now).toISODate()).toBe('2026-10-05');
    for (const value of [
      '2026-10-06',
      '2026-10-19',
      '2026-10-12',
      '2026-02-30',
      '2026-10-05T00:00:00',
    ]) {
      expect(() => getReportWeek(value, now)).toThrow();
    }
  });
  it('clips cross-week incidents and deduplicates overlapping periods and line IDs', () => {
    const issue = buildIssue('cross-week', 'disruption', [
      interval('2026-10-04T23:00:00+08:00', '2026-10-05T02:00:00+08:00'),
      interval('2026-10-05T01:00:00+08:00', '2026-10-05T03:00:00+08:00'),
    ]);
    issue.lineIds = [TEST_LINE.id, TEST_LINE.id];
    const summary = buildWeeklySummary(
      [issue],
      { [TEST_LINE.id]: TEST_LINE },
      start,
      end,
      now,
    );
    expect(summary.disruptionCount).toBe(1);
    expect(summary.disruptionSeconds).toBe(3 * 3600);
    expect(summary.lines[0].count).toBe(1);
    expect(summary.days.map((day) => day.count)).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
  it('excludes end-boundary incidents and separates planned maintenance', () => {
    const issues = [
      buildIssue('outside', 'disruption', [
        interval('2026-10-12T00:00:00+08:00', null),
      ]),
      buildIssue('maintenance', 'maintenance', [
        interval('2026-10-05T00:00:00+08:00', '2026-10-06T00:00:00+08:00'),
      ]),
    ];
    const summary = buildWeeklySummary(issues, {}, start, end, now);
    expect(summary.disruptionCount).toBe(0);
    expect(summary.maintenanceCount).toBe(1);
  });
  it('caps ongoing incidents at the elapsed week and marks future days unavailable', () => {
    const partialEnd = start.plus({ hours: 12 });
    const summary = buildWeeklySummary(
      [
        buildIssue('ongoing', 'disruption', [
          interval('2026-10-05T00:00:00+08:00', null),
        ]),
      ],
      {},
      start,
      partialEnd,
      partialEnd,
    );
    expect(summary.disruptionSeconds).toBe(12 * 3600);
    expect(summary.days.map((day) => day.available)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('weekly archive boundary', () => {
  it('accepts the first supported week and rejects earlier dates', () => {
    const now = DateTime.fromISO('2026-10-13', { zone: REPORT_ZONE });
    expect(getReportWeek('2011-08-29', now, '2011-08-29').toISODate()).toBe(
      '2011-08-29',
    );
    expect(() => getReportWeek('2011-08-22', now, '2011-08-29')).toThrow();
    expect(() => getReportWeek('1900-01-01', now, '2011-08-29')).toThrow();
  });
});
