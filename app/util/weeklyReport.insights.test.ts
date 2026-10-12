import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { buildIssue, TEST_LINE } from './dbQueries/testFixtures';
import { buildWeeklySummary, REPORT_ZONE } from './weeklyReport';
import { selectWeeklyInsights } from './weeklyReport.insights';

const start = DateTime.fromISO('2026-09-28', { zone: REPORT_ZONE });
const empty = buildWeeklySummary(
  [],
  {},
  start,
  start.plus({ weeks: 1 }),
  start,
);
const current = {
  ...empty,
  disruptionCount: 2,
  disruptionSeconds: 100,
  incidents: [
    {
      id: 'one',
      title: { 'en-SG': 'One', 'zh-Hans': null, ms: null, ta: null },
      lineIds: [],
      seconds: 60,
    },
    {
      id: 'two',
      title: { 'en-SG': 'Two', 'zh-Hans': null, ms: null, ta: null },
      lineIds: [],
      seconds: 40,
    },
  ],
};
const input = {
  current,
  previous: { disruptionCount: 2, disruptionSeconds: 100 },
  partial: false,
  recentWeeks: Array.from({ length: 4 }, () => ({
    disruptionCount: 1,
    disruptionSeconds: 50,
  })),
};

describe('weekly takeaways', () => {
  it('explains opposing count and duration changes before the recent average', () => {
    expect(
      selectWeeklyInsights({
        ...input,
        previous: { disruptionCount: 3, disruptionSeconds: 50 },
      })[0],
    ).toEqual({ kind: 'longer' });
    expect(
      selectWeeklyInsights({
        ...input,
        previous: { disruptionCount: 1, disruptionSeconds: 150 },
      })[0],
    ).toEqual({ kind: 'shorter' });
  });
  it('uses an exact four-week average and detects incident concentration at 60%', () => {
    expect(selectWeeklyInsights(input)).toEqual([
      { kind: 'concentrated', percent: 60 },
      { kind: 'recent', average: 1, direction: 'above' },
    ]);
    expect(
      selectWeeklyInsights({
        ...input,
        recentWeeks: input.recentWeeks.slice(1),
      }),
    ).toEqual([{ kind: 'concentrated', percent: 60 }]);
  });
  it('does not compare unfinished weeks with full-week averages', () => {
    expect(selectWeeklyInsights({ ...input, partial: true })).toEqual([
      { kind: 'concentrated', percent: 60 },
    ]);
  });
  it('uses a 20% band for a similar count and identifies spread only with four active days', () => {
    expect(
      selectWeeklyInsights({
        ...input,
        recentWeeks: input.recentWeeks.map(() => ({
          disruptionCount: 2,
          disruptionSeconds: 100,
        })),
      })[1],
    ).toEqual({ kind: 'recent', average: 2, direction: 'similar' });
    expect(
      selectWeeklyInsights({
        ...input,
        current: {
          ...current,
          incidents: current.incidents.map((incident) => ({
            ...incident,
            seconds: 50,
          })),
          days: current.days.map((day, index) => ({
            ...day,
            count: index < 4 ? 1 : 0,
          })),
        },
      })[0],
    ).toEqual({ kind: 'spread', days: 4 });
  });
  it('avoids inventing explanations for quiet weeks and identifies single incidents', () => {
    expect(selectWeeklyInsights({ ...input, current: empty })).toEqual([
      { kind: 'quiet' },
    ]);
    expect(
      selectWeeklyInsights({
        ...input,
        current: { ...current, disruptionCount: 1 },
      })[1],
    ).toEqual({ kind: 'single' });
  });
});

describe('reader digest context', () => {
  const line = {
    id: TEST_LINE.id,
    name: TEST_LINE.name,
    color: TEST_LINE.color,
    count: 1,
    seconds: 100,
  };
  const onLine = {
    ...current,
    lines: [line],
    readerContext: {
      ...current.readerContext,
      lineIssueIds: { [line.id]: ['current'] },
    },
  };
  it('offers a clear-week trivia note without claiming flawless service', () => {
    const recentWeeks = input.recentWeeks.map((week) => ({
      ...week,
      lineIssueIds: { [line.id]: [] },
    }));
    expect(
      selectWeeklyInsights({ ...input, current: onLine, recentWeeks }),
    ).toEqual([
      { kind: 'return', line: line.name, weeks: 4 },
      { kind: 'concentrated', percent: 60 },
    ]);
  });
  it('requires separate incidents for a recurrence note', () => {
    const recentWeeks = input.recentWeeks.map((week, index) => ({
      ...week,
      lineIssueIds: { [line.id]: [index === 0 ? 'last' : 'older'] },
    }));
    expect(
      selectWeeklyInsights({ ...input, current: onLine, recentWeeks })[0],
    ).toEqual({ kind: 'recurring', line: line.name });
    const ongoing = recentWeeks.map((week) => ({
      ...week,
      lineIssueIds: { [line.id]: ['current'] },
    }));
    expect(
      selectWeeklyInsights({
        ...input,
        current: onLine,
        recentWeeks: ongoing,
      }).some((insight) => insight.kind === 'recurring'),
    ).toBe(false);
  });
  it('prioritizes recorded suspension effects over peak hours and caps the digest at two takeaways', () => {
    const recentWeeks = input.recentWeeks.map((week) => ({
      ...week,
      lineIssueIds: { [line.id]: [] },
    }));
    const result = selectWeeklyInsights({
      ...input,
      recentWeeks,
      current: {
        ...onLine,
        readerContext: {
          ...onLine.readerContext,
          suspensionLines: [line.name],
          peakIncidentCount: 1,
        },
      },
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ kind: 'suspension', lines: [line.name] });
  });
  it('counts distinct incidents overlapping the defined weekday peak windows, excluding boundary-only overlap', () => {
    const issues = [
      buildIssue('peak', 'disruption', [
        {
          startAt: '2026-09-28T08:00:00+08:00',
          endAt: '2026-09-28T08:30:00+08:00',
          status: 'ended',
        },
      ]),
      buildIssue('outside', 'disruption', [
        {
          startAt: '2026-09-28T09:00:00+08:00',
          endAt: '2026-09-28T10:00:00+08:00',
          status: 'ended',
        },
      ]),
    ];
    const summary = buildWeeklySummary(
      issues,
      { [line.id]: TEST_LINE },
      start,
      start.plus({ weeks: 1 }),
      start.plus({ weeks: 1 }),
    );
    expect(summary.readerContext.peakIncidentCount).toBe(1);
  });
});

describe('ranked digest selection', () => {
  it('selects interchange context over a generic one-line observation', () => {
    const station = TEST_LINE.name;
    const result = selectWeeklyInsights({
      ...input,
      current: {
        ...current,
        readerContext: {
          ...current.readerContext,
          interchangeNames: [station],
        },
      },
    });
    expect(result[0]).toEqual({ kind: 'interchanges', stations: [station] });
    expect(result).toHaveLength(2);
  });
  it('chooses only one timing angle, prioritizing peak overlap over weekend concentration', () => {
    const result = selectWeeklyInsights({
      ...input,
      current: {
        ...current,
        readerContext: {
          ...current.readerContext,
          peakIncidentCount: 1,
          weekendSeconds: 80,
          multiDayIncidentDays: 4,
        },
      },
    });
    expect(result[0]).toEqual({ kind: 'peak', count: 1 });
    expect(
      result.some(
        (insight) => insight.kind === 'weekend' || insight.kind === 'multiDay',
      ),
    ).toBe(false);
  });
  it('lets planned service changes lead a quiet week', () => {
    const result = selectWeeklyInsights({
      ...input,
      current: {
        ...empty,
        readerContext: {
          ...empty.readerContext,
          maintenanceLines: [TEST_LINE.name],
          maintenanceChangeLines: [TEST_LINE.name],
        },
      },
    });
    expect(result).toEqual([
      { kind: 'maintenanceChange', lines: [TEST_LINE.name] },
      { kind: 'quiet' },
    ]);
  });
  it('does not fill a second slot with a repeated single-incident quiet-stretch fact', () => {
    const result = selectWeeklyInsights({
      ...input,
      current: { ...current, disruptionCount: 1 },
      recentWeeks: input.recentWeeks.map((week) => ({
        ...week,
        disruptionCount: 0,
      })),
    });
    expect(result).toEqual([{ kind: 'first', weeks: 4 }]);
  });
});
