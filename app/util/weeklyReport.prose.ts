import { DateTime } from 'luxon';
import type { IntlShape } from 'react-intl';
import { REPORT_ZONE, type WeeklySummary } from './weeklyReport';
import { weeklyMessages as messages } from './weeklyReport.messages';

export function formatReportDates(week: string, intl: IntlShape) {
  const start = DateTime.fromISO(week, { zone: REPORT_ZONE });
  return new Intl.DateTimeFormat(intl.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: REPORT_ZONE,
  }).formatRange(start.toJSDate(), start.plus({ days: 6 }).toJSDate());
}

export function formatReportWeek(week: string, intl: IntlShape) {
  const date = intl.formatDate(
    DateTime.fromISO(week, { zone: REPORT_ZONE }).toJSDate(),
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: REPORT_ZONE },
  );
  return intl.formatMessage(messages.issueHeading, { date });
}

export function formatReportDuration(seconds: number, intl: IntlShape) {
  if (seconds > 0 && seconds < 60)
    return intl.formatMessage(messages.underMinute);
  const total = Math.round(seconds / 60);
  return intl.formatMessage(total < 60 ? messages.minutes : messages.hours, {
    hours: Math.floor(total / 60),
    minutes: total % 60,
  });
}

function direction(difference: number) {
  return difference === 0 ? 'same' : difference > 0 ? 'more' : 'less';
}

export function formatCountChange(
  current: number,
  previous: number,
  intl: IntlShape,
) {
  return intl.formatMessage(messages.countChange, {
    direction: direction(current - previous),
    count: Math.abs(current - previous),
  });
}

export function formatTimeChange(
  current: number,
  previous: number,
  intl: IntlShape,
) {
  return intl.formatMessage(messages.timeChange, {
    direction: direction(current - previous),
    duration: formatReportDuration(Math.abs(current - previous), intl),
  });
}

type WeeklyProseInput = {
  week: string;
  partial: boolean;
  current: WeeklySummary;
  previous: WeeklySummary;
};
export function buildWeeklyProse(report: WeeklyProseInput, intl: IntlShape) {
  const { current } = report;
  // Takeaways explain the pattern; the incident list and metric cards provide
  // details and comparisons. Keep this recap to the week's totals.
  const paragraphs =
    current.disruptionCount > 0
      ? [
          intl.formatMessage(messages.summary, {
            dates: formatReportDates(report.week, intl),
            count: current.disruptionCount,
            duration: formatReportDuration(current.disruptionSeconds, intl),
          }),
        ]
      : [];
  const other = [];
  if (current.maintenanceCount > 0)
    other.push(
      intl.formatMessage(messages.maintenance, {
        count: current.maintenanceCount,
      }),
    );
  if (current.infrastructureCount > 0)
    other.push(
      intl.formatMessage(messages.infra, {
        count: current.infrastructureCount,
      }),
    );
  return [...paragraphs, ...(other.length ? [other.join(' ')] : [])];
}
