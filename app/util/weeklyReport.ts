import { DateTime } from 'luxon';
import type { Issue, Line } from '~/types';
import {
  clipIssueIntervalsToRange,
  sumIntervalSeconds,
} from './dbQueries/issueIntervals';

export const REPORT_ZONE = 'Asia/Singapore';

export function getReportWeek(value: string, now: DateTime) {
  const start = DateTime.fromISO(value, { zone: REPORT_ZONE });
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !start.isValid ||
    start.weekday !== 1 ||
    start > now.setZone(REPORT_ZONE).startOf('week')
  ) {
    throw new Error('Choose a Monday on or before the current week.');
  }
  return start;
}

export function buildWeeklySummary(
  issues: Issue[],
  lines: Record<string, Line>,
  start: DateTime,
  end: DateTime,
  now: DateTime,
) {
  const entries = issues
    .map((issue) => ({
      issue,
      seconds: sumIntervalSeconds(
        clipIssueIntervalsToRange(issue, start, end, now),
        now,
      ),
    }))
    .filter((entry) => entry.seconds > 0);
  const disruptions = entries.filter(
    ({ issue }) => issue.type === 'disruption',
  );
  return {
    disruptionCount: disruptions.length,
    disruptionSeconds: disruptions.reduce(
      (sum, entry) => sum + entry.seconds,
      0,
    ),
    maintenanceCount: entries.filter(
      ({ issue }) => issue.type === 'maintenance',
    ).length,
    infrastructureCount: entries.filter(({ issue }) => issue.type === 'infra')
      .length,
    days: Array.from({ length: 7 }, (_, index) => {
      const day = start.plus({ days: index });
      const dayEnd = day.plus({ days: 1 }) < end ? day.plus({ days: 1 }) : end;
      const active = disruptions.filter(
        ({ issue }) =>
          clipIssueIntervalsToRange(issue, day, dayEnd, now).length > 0,
      );
      return {
        date: day.toISODate() as string,
        count: active.length,
        available: day < end,
      };
    }),
    lines: Object.values(lines)
      .filter((line) =>
        disruptions.some(({ issue }) => issue.lineIds.includes(line.id)),
      )
      .map((line) => {
        const affected = disruptions.filter(({ issue }) =>
          issue.lineIds.includes(line.id),
        );
        return {
          id: line.id,
          name: line.name,
          color: line.color,
          count: affected.length,
          seconds: affected.reduce((sum, entry) => sum + entry.seconds, 0),
        };
      })
      .sort((a, b) => b.seconds - a.seconds || a.id.localeCompare(b.id)),
    incidents: [...disruptions]
      .sort(
        (a, b) => b.seconds - a.seconds || a.issue.id.localeCompare(b.issue.id),
      )
      .map(({ issue, seconds }) => ({
        id: issue.id,
        title: issue.title,
        lineIds: issue.lineIds,
        seconds,
      })),
  };
}

export type WeeklySummary = ReturnType<typeof buildWeeklySummary>;
