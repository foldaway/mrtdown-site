import type { ServiceEffectKind } from '@mrtdown/core';
import { DateTime } from 'luxon';
import type { Issue, Line, Station } from '~/types';
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
    start.plus({ weeks: 1 }) > now.setZone(REPORT_ZONE)
  ) {
    throw new Error('Choose a Monday from a completed week.');
  }
  return start;
}

export function buildWeeklySummary(
  issues: Issue[],
  lines: Record<string, Line>,
  start: DateTime,
  end: DateTime,
  now: DateTime,
  stations: Record<string, Station> = {},
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
  const lineNames = (ids: Iterable<string>) =>
    [...new Set(ids)]
      .sort()
      .flatMap((id) => (lines[id] ? [lines[id].name] : []));
  const lineIssueIds = Object.fromEntries(
    Object.keys(lines).map((lineId) => [
      lineId,
      disruptions
        .filter(({ issue }) => issue.lineIds.includes(lineId))
        .map(({ issue }) => issue.id),
    ]),
  );
  const suspensions = disruptions.filter(({ issue }) =>
    (
      issue as Issue & { serviceEffectKinds?: ServiceEffectKind[] }
    ).serviceEffectKinds?.includes('no-service'),
  );
  const peakIncidentCount = disruptions.filter(({ issue }) => {
    const intervals = clipIssueIntervalsToRange(issue, start, end, now);
    return Array.from({ length: 7 }, (_, index) => start.plus({ days: index }))
      .filter((day) => day.weekday <= 5)
      .some((day) =>
        [7, 17].some((hour) => {
          const peakStart = day.set({ hour });
          const peakEnd = peakStart.plus({ hours: 2 });
          return intervals.some(
            (interval) =>
              interval.start < peakEnd && (interval.end ?? now) > peakStart,
          );
        }),
      );
  }).length;
  const weekendSeconds = disruptions.reduce(
    (total, { issue }) =>
      total +
      [5, 6].reduce(
        (sum, day) =>
          sum +
          sumIntervalSeconds(
            clipIssueIntervalsToRange(
              issue,
              start.plus({ days: day }),
              start.plus({ days: day + 1 }),
              now,
            ),
            now,
          ),
        0,
      ),
    0,
  );
  const affectedStationIds = new Set(
    disruptions.flatMap(({ issue }) =>
      issue.branchesAffected.flatMap((branch) => branch.stationIds),
    ),
  );
  const interchanges = Object.values(stations)
    .filter(
      (station) =>
        affectedStationIds.has(station.id) &&
        new Set(
          station.memberships
            .filter(
              (membership) =>
                DateTime.fromISO(membership.startedAt, { zone: REPORT_ZONE }) <
                  end &&
                (!membership.endedAt ||
                  DateTime.fromISO(membership.endedAt, { zone: REPORT_ZONE }) >
                    start),
            )
            .map((membership) => membership.lineId),
        ).size > 1,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const multiDayIncident = disruptions
    .map(({ issue }) => ({
      id: issue.id,
      days: Array.from(
        { length: 7 },
        (_, day) =>
          clipIssueIntervalsToRange(
            issue,
            start.plus({ days: day }),
            start.plus({ days: day + 1 }),
            now,
          ).length > 0,
      ).filter(Boolean).length,
    }))
    .sort((a, b) => b.days - a.days || a.id.localeCompare(b.id))[0];
  const maintenanceChanges = entries.filter(
    ({ issue }) =>
      issue.type === 'maintenance' &&
      (
        issue as Issue & { serviceEffectKinds?: ServiceEffectKind[] }
      ).serviceEffectKinds?.some(
        (kind) => kind === 'no-service' || kind === 'service-hours-adjustment',
      ),
  );
  return {
    readerContext: {
      lineIssueIds,
      weekendSeconds,
      interchangeNames: interchanges.slice(0, 2).map((station) => station.name),
      multiDayIncidentDays: multiDayIncident?.days ?? 0,
      maintenanceChangeLines: lineNames(
        maintenanceChanges.flatMap(({ issue }) => issue.lineIds),
      ),
      suspensionLines: lineNames(
        suspensions.flatMap(({ issue }) => issue.lineIds),
      ),
      peakIncidentCount,
      maintenanceLines: lineNames(
        entries
          .filter(({ issue }) => issue.type === 'maintenance')
          .flatMap(({ issue }) => issue.lineIds),
      ),
    },
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
