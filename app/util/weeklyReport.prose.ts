import { DateTime } from 'luxon';
import type { IntlShape } from 'react-intl';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
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
  const { current, previous } = report;
  const paragraphs = [
    intl.formatMessage(
      current.disruptionCount === 0 ? messages.quiet : messages.summary,
      {
        dates: formatReportDates(report.week, intl),
        count: current.disruptionCount,
        duration: formatReportDuration(current.disruptionSeconds, intl),
      },
    ),
  ];
  const longest = current.incidents[0];
  if (longest)
    paragraphs.push(
      intl.formatMessage(messages.longest, {
        title: getLocalizedTranslation(longest.title, intl.locale),
        duration: formatReportDuration(longest.seconds, intl),
      }),
    );
  if (report.partial) {
    paragraphs.push(
      intl.formatMessage(messages.partialComparison, {
        countChange: formatCountChange(
          current.disruptionCount,
          previous.disruptionCount,
          intl,
        ),
        timeChange: formatTimeChange(
          current.disruptionSeconds,
          previous.disruptionSeconds,
          intl,
        ),
      }),
    );
  } else {
    paragraphs.push(
      [
        intl.formatMessage(messages.countComparison, {
          direction: direction(
            current.disruptionCount - previous.disruptionCount,
          ),
          count: Math.abs(current.disruptionCount - previous.disruptionCount),
        }),
        intl.formatMessage(messages.timeComparison, {
          direction: direction(
            current.disruptionSeconds - previous.disruptionSeconds,
          ),
          duration: formatReportDuration(
            Math.abs(current.disruptionSeconds - previous.disruptionSeconds),
            intl,
          ),
        }),
      ].join(' '),
    );
  }
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
  return other.length
    ? [paragraphs.join(' '), other.join(' ')]
    : [paragraphs.join(' ')];
}
