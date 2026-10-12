import { DateTime } from 'luxon';
import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import en from '../../lang/en-SG.json';
import ms from '../../lang/ms.json';
import ta from '../../lang/ta.json';
import zh from '../../lang/zh-Hans.json';
import { buildIssue, TEST_LINE } from './dbQueries/testFixtures';
import { buildWeeklySummary, REPORT_ZONE } from './weeklyReport';
import { weeklyMessages } from './weeklyReport.messages';
import {
  buildWeeklyProse,
  formatReportDates,
  formatReportDuration,
  formatReportWeek,
} from './weeklyReport.prose';

const start = DateTime.fromISO('2026-09-28', { zone: REPORT_ZONE });
const end = start.plus({ weeks: 1 });
const empty = buildWeeklySummary([], {}, start, end, end);
const incident = buildIssue('Recorded delay', 'disruption', [
  {
    startAt: '2026-09-29T12:00:00+08:00',
    endAt: '2026-09-29T14:45:00+08:00',
    status: 'ended',
  },
]);
const active = buildWeeklySummary(
  [incident],
  { [TEST_LINE.id]: TEST_LINE },
  start,
  end,
  end,
);
const english = createIntl({ locale: 'en-SG', messages: en });

describe('deterministic weekly prose', () => {
  it('reports only known facts, with singular grammar and absolute changes', () => {
    const report = {
      week: '2026-09-28',
      partial: false,
      current: active,
      previous: { ...empty, disruptionCount: 2, disruptionSeconds: 10800 },
    };
    const prose = buildWeeklyProse(report, english);
    expect(buildWeeklyProse(report, english)).toEqual(prose);
    expect(prose[0]).toContain('1 disruption');
    expect(prose[0]).toContain('2 hours 45 minutes');
    expect(prose[0]).not.toContain('Recorded delay');
    expect(prose[0]).not.toContain('previous week');
    expect(prose).toHaveLength(1);
  });
  it('omits longest incident and absent maintenance for quiet weeks', () => {
    const prose = buildWeeklyProse(
      { week: '2026-09-28', partial: false, current: empty, previous: empty },
      english,
    );
    expect(prose).toEqual([]);
  });
  it('uses elapsed-period wording and mentions maintenance only when present', () => {
    const prose = buildWeeklyProse(
      {
        week: '2026-09-28',
        partial: true,
        current: { ...active, maintenanceCount: 1, infrastructureCount: 2 },
        previous: empty,
      },
      english,
    );
    expect(prose[0]).not.toContain('last week');
    expect(prose[1]).toBe(
      'The week also included 1 planned maintenance event. 2 infrastructure issues were active during the week.',
    );
  });
  it('formats durations and cross-year ranges without losing the year', () => {
    expect(formatReportWeek('2026-09-28', english)).toBe(
      'Week of 28 September 2026',
    );
    expect(formatReportDuration(30, english)).toBe('less than a minute');
    expect(formatReportDuration(60, english)).toBe('1 minute');
    expect(formatReportDuration(0, english)).toBe('0 minutes');
    const dates = formatReportDates('2025-12-29', english);
    expect(dates).toContain('2025');
    expect(dates).toContain('2026');
  });
  for (const [locale, messages] of Object.entries({
    'en-SG': en,
    'zh-Hans': zh,
    ms,
    ta,
  })) {
    it(`has valid translations for every weekly message and branch in ${locale}`, () => {
      const errors: unknown[] = [];
      const intl = createIntl({
        locale,
        messages,
        onError: (error) => errors.push(error),
      });
      for (const message of Object.values(weeklyMessages)) {
        expect(messages).toHaveProperty(message.id);
        for (const direction of ['same', 'more', 'less']) {
          const rendered = intl.formatMessage(message, {
            direction,
            dates: formatReportDates('2026-09-28', intl),
            count: 2,
            duration: formatReportDuration(9900, intl),
            title: 'DTL',
            countChange: '1',
            timeChange: '2',
            hours: 2,
            minutes: 45,
            date: '2026',
            average: '1.5',
            line: 'DTL',
            lines: 'DTL',
            stations: 'Dhoby Ghaut',
            weeks: 3,
            percent: 70,
            days: 4,
            week: formatReportWeek('2026-09-28', intl),
          });
          expect(rendered).not.toContain('{');
        }
      }
      for (const count of [0, 1, 2]) {
        buildWeeklyProse(
          {
            week: '2026-09-28',
            partial: false,
            current: { ...active, disruptionCount: count },
            previous: empty,
          },
          intl,
        );
      }
      expect(errors).toEqual([]);
    });
  }
});
