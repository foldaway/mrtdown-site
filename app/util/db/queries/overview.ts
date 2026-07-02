import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import {
  impactEventPeriodsTable,
  impactEventsTable,
  lineDayFactsTable,
  lineOperatorsTable,
  linesTable,
} from '~/db/schema';
import type { IncludedEntities, Line, LineSummary } from '~/types';
import { getPublicCrowdReportSignals } from '~/util/crowdReports';
import { timeServerSpan, timeSyncServerSpan } from '~/util/serverTiming';
import { selectIncludedEntities } from './included';
import { getScopedIssueHydrationFromDb } from './issues';
import { issueActiveNow, issueActiveToday } from './issueIntervals';
import {
  buildIssueTypeBreakdownForDate,
  rankLineSummaries,
} from './lineSummaries';
import {
  isLineFuture,
  isLineOperatingNow,
  lineDayType,
  serviceWindowForDate,
} from './lineService';
import {
  buildLines,
  getDefaultDb,
  getPublicHolidaySetFromDb,
  groupIssuesByLineId,
  selectByIdChunks,
  timeDbQuery,
} from './shared';
import {
  isoDate,
  isoDateTime,
  nowSg,
  parseDateTime,
  SG_TIMEZONE,
} from './temporal';
import type {
  BaseIncludedEntities,
  CommunitySignalOptions,
  IssueWithOperationalEffects,
} from './types';

type LineDayFactRow = typeof lineDayFactsTable.$inferSelect;
type OverviewDb = AppDb;

async function getLinesFromDb(db: OverviewDb) {
  const [lineRows, lineOperatorRows] = await timeServerSpan(
    'overview_line_queries',
    () =>
      Promise.all([
        timeDbQuery('overview_q_lines', () =>
          db
            .select({
              id: linesTable.id,
              name: linesTable.name,
              type: linesTable.type,
              color: linesTable.color,
              started_at: linesTable.started_at,
              operating_hours: linesTable.operating_hours,
            })
            .from(linesTable)
            .orderBy(asc(linesTable.id)),
        ),
        timeDbQuery('overview_q_line_operators', () =>
          db
            .select({
              line_id: lineOperatorsTable.line_id,
              operator_id: lineOperatorsTable.operator_id,
              started_at: lineOperatorsTable.started_at,
              ended_at: lineOperatorsTable.ended_at,
            })
            .from(lineOperatorsTable),
        ),
      ]),
  );

  return buildLines(lineRows, lineOperatorRows);
}

async function getLineDayFactsFromDb(
  db: OverviewDb,
  start: DateTime,
  end: DateTime,
) {
  return timeDbQuery('overview_q_line_day_facts', () =>
    db
      .select({
        date: lineDayFactsTable.date,
        line_id: lineDayFactsTable.line_id,
        service_seconds: lineDayFactsTable.service_seconds,
        downtime_disruption_seconds:
          lineDayFactsTable.downtime_disruption_seconds,
        downtime_maintenance_seconds:
          lineDayFactsTable.downtime_maintenance_seconds,
        downtime_infra_seconds: lineDayFactsTable.downtime_infra_seconds,
        issue_count_disruption: lineDayFactsTable.issue_count_disruption,
        issue_count_maintenance: lineDayFactsTable.issue_count_maintenance,
        issue_count_infra: lineDayFactsTable.issue_count_infra,
      })
      .from(lineDayFactsTable)
      .where(
        and(
          gte(lineDayFactsTable.date, isoDate(start)),
          lte(lineDayFactsTable.date, isoDate(end)),
        ),
      ),
  );
}

async function getIssueIdsOverlappingRange(
  db: OverviewDb,
  start: DateTime,
  end: DateTime,
) {
  const overlappingPeriodRows = await timeDbQuery(
    'overview_q_overlapping_periods',
    () =>
      db
        .select({
          impact_event_id: impactEventPeriodsTable.impact_event_id,
        })
        .from(impactEventPeriodsTable)
        .where(
          sql`${impactEventPeriodsTable.start_at} < ${isoDateTime(end)} and (${impactEventPeriodsTable.end_at} is null or ${impactEventPeriodsTable.end_at} > ${isoDateTime(start)})`,
        ),
  );
  const overlappingPeriodEventIds = [
    ...new Set(overlappingPeriodRows.map((row) => row.impact_event_id)),
  ];
  const overlappingPeriodEventIdSet = new Set(overlappingPeriodEventIds);
  const overlappingPeriodEventRows = await timeDbQuery(
    'overview_q_period_events_for_overlap',
    () =>
      selectByIdChunks(overlappingPeriodEventIds, (ids) =>
        db
          .select({
            id: impactEventsTable.id,
            issue_id: impactEventsTable.issue_id,
          })
          .from(impactEventsTable)
          .where(inArray(impactEventsTable.id, ids)),
      ),
  );
  const candidateIssueIds = [
    ...new Set(overlappingPeriodEventRows.map((event) => event.issue_id)),
  ];
  const periodEventRows = await timeDbQuery(
    'overview_q_period_events_for_issues',
    () =>
      selectByIdChunks(candidateIssueIds, (ids) =>
        db
          .select({
            id: impactEventsTable.id,
            issue_id: impactEventsTable.issue_id,
            ts: impactEventsTable.ts,
          })
          .from(impactEventsTable)
          .where(
            and(
              eq(impactEventsTable.type, 'periods.set'),
              inArray(impactEventsTable.issue_id, ids),
            ),
          ),
      ),
  );
  const latestPeriodEventByIssueId = periodEventRows.reduce<
    Record<string, (typeof periodEventRows)[number]>
  >((acc, event) => {
    const current = acc[event.issue_id];
    if (current == null) {
      acc[event.issue_id] = event;
      return acc;
    }

    const tsDiff =
      parseDateTime(event.ts).toMillis() - parseDateTime(current.ts).toMillis();
    if (tsDiff > 0 || (tsDiff === 0 && event.id > current.id)) {
      acc[event.issue_id] = event;
    }
    return acc;
  }, {});

  return Object.values(latestPeriodEventByIssueId)
    .filter((event) => overlappingPeriodEventIdSet.has(event.id))
    .map((event) => event.issue_id);
}

function emptyIncluded(lines: Record<string, Line>): BaseIncludedEntities {
  return {
    lines,
    stations: {},
    operators: {},
    towns: {},
    landmarks: {},
  };
}

function getFactValue(
  fact: LineDayFactRow | undefined,
  key: keyof Pick<
    LineDayFactRow,
    | 'downtime_disruption_seconds'
    | 'downtime_maintenance_seconds'
    | 'downtime_infra_seconds'
    | 'issue_count_disruption'
    | 'issue_count_maintenance'
    | 'issue_count_infra'
    | 'service_seconds'
  >,
) {
  return fact?.[key] ?? 0;
}

export function buildFactBackedLineSummaries({
  days,
  facts,
  lines,
  publicHolidaySet,
  issuesByLineId,
  referenceNow,
}: {
  days: number;
  facts: LineDayFactRow[];
  lines: Record<string, Line>;
  publicHolidaySet: Set<string>;
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>;
  referenceNow: DateTime;
}) {
  const referenceDateTime = referenceNow.setZone(SG_TIMEZONE);
  const rangeStart = referenceDateTime.startOf('day').minus({ days: days - 1 });
  const factsByLineDate = new Map<string, LineDayFactRow>();
  for (const fact of facts) {
    factsByLineDate.set(`${fact.line_id}::${fact.date}`, fact);
  }

  const lineSummaries = Object.values(lines).map((line) => {
    const breakdownByDates: LineSummary['breakdownByDates'] = {};
    const durationSecondsByIssueType: LineSummary['durationSecondsByIssueType'] =
      {};
    const lineIssues = issuesByLineId[line.id] ?? [];
    let totalServiceSeconds = 0;
    let totalDowntimeSeconds = 0;

    for (let offset = 0; offset < days; offset++) {
      const date = rangeStart.plus({ days: offset });
      const dateKey = isoDate(date);
      const dayWindow = serviceWindowForDate(line, date, publicHolidaySet);
      const calendarDayStart = date.startOf('day');
      const calendarDayEnd = calendarDayStart.plus({ days: 1 });
      const allocationWindow = {
        start:
          dayWindow.start > calendarDayStart
            ? dayWindow.start
            : calendarDayStart,
        end: dayWindow.end < calendarDayEnd ? dayWindow.end : calendarDayEnd,
      };
      const fact = factsByLineDate.get(`${line.id}::${dateKey}`);
      const disruptionSeconds = getFactValue(
        fact,
        'downtime_disruption_seconds',
      );
      const maintenanceSeconds = getFactValue(
        fact,
        'downtime_maintenance_seconds',
      );
      const infraSeconds = getFactValue(fact, 'downtime_infra_seconds');
      const serviceSeconds = getFactValue(fact, 'service_seconds');
      totalServiceSeconds += serviceSeconds;
      totalDowntimeSeconds +=
        disruptionSeconds + maintenanceSeconds + infraSeconds;
      durationSecondsByIssueType.disruption =
        (durationSecondsByIssueType.disruption ?? 0) + disruptionSeconds;
      durationSecondsByIssueType.maintenance =
        (durationSecondsByIssueType.maintenance ?? 0) + maintenanceSeconds;
      durationSecondsByIssueType.infra =
        (durationSecondsByIssueType.infra ?? 0) + infraSeconds;

      const breakdownByIssueTypes = buildIssueTypeBreakdownForDate(
        lineIssues,
        date,
        referenceDateTime,
        allocationWindow,
      );
      if (breakdownByIssueTypes.disruption == null && disruptionSeconds > 0) {
        breakdownByIssueTypes.disruption = {
          totalDurationSeconds: disruptionSeconds,
          issueIds: [],
        };
      }
      if (breakdownByIssueTypes.maintenance == null && maintenanceSeconds > 0) {
        breakdownByIssueTypes.maintenance = {
          totalDurationSeconds: maintenanceSeconds,
          issueIds: [],
        };
      }
      if (breakdownByIssueTypes.infra == null && infraSeconds > 0) {
        breakdownByIssueTypes.infra = {
          totalDurationSeconds: infraSeconds,
          issueIds: [],
        };
      }

      breakdownByDates[dateKey] = {
        breakdownByIssueTypes,
        dayType: lineDayType(date, publicHolidaySet),
      };
    }

    const activeNowIssues = lineIssues.filter((issue) =>
      issueActiveNow(issue, referenceDateTime),
    );
    const status = (() => {
      if (isLineFuture(line, referenceDateTime)) {
        return 'future_service';
      }
      if (!isLineOperatingNow(line, publicHolidaySet, referenceDateTime)) {
        return 'closed_for_day';
      }
      if (activeNowIssues.some((issue) => issue.type === 'disruption')) {
        return 'ongoing_disruption';
      }
      if (activeNowIssues.some((issue) => issue.type === 'maintenance')) {
        return 'ongoing_maintenance';
      }
      if (activeNowIssues.some((issue) => issue.type === 'infra')) {
        return 'ongoing_infra';
      }
      return 'normal';
    })();

    return {
      lineId: line.id,
      status,
      durationSecondsByIssueType,
      durationSecondsTotalForIssues: Object.values(
        durationSecondsByIssueType,
      ).reduce((sum, value) => sum + (value ?? 0), 0),
      breakdownByDates,
      uptimeRatio:
        totalServiceSeconds > 0
          ? Math.max(0, 1 - totalDowntimeSeconds / totalServiceSeconds)
          : null,
      totalServiceSeconds: totalServiceSeconds > 0 ? totalServiceSeconds : null,
      totalDowntimeSeconds:
        totalServiceSeconds > 0 ? totalDowntimeSeconds : null,
      downtimeBreakdown:
        totalServiceSeconds > 0
          ? (['disruption', 'maintenance', 'infra'] as const).map((type) => ({
              type,
              downtimeSeconds: durationSecondsByIssueType[type] ?? 0,
            }))
          : null,
      uptimeRank: null,
      totalLines: null,
    } satisfies LineSummary;
  });

  return rankLineSummaries(lineSummaries);
}

export async function getOverviewData(
  days: number,
  options: CommunitySignalOptions = {},
) {
  return timeServerSpan('overview_data', async () => {
    const db = await getDefaultDb();
    return getOverviewDataFromDb(db, days, options);
  });
}

export async function getOverviewDataFromDb(
  db: OverviewDb,
  days: number,
  options: CommunitySignalOptions = {},
  referenceNow = nowSg(),
) {
  const referenceDateTime = referenceNow.setZone(SG_TIMEZONE);
  const rangeStart = referenceDateTime.startOf('day').minus({ days: days - 1 });
  const rangeEnd = referenceDateTime.startOf('day');
  const todayStart = referenceDateTime.startOf('day');
  const todayEnd = todayStart.plus({ days: 1 });

  const [
    lines,
    publicHolidaySet,
    lineDayFacts,
    candidateIssueIdsInRange,
    communitySignals,
  ] = await Promise.all([
    getLinesFromDb(db),
    getPublicHolidaySetFromDb(db, 'overview_q_public_holidays'),
    getLineDayFactsFromDb(db, rangeStart, rangeEnd),
    getIssueIdsOverlappingRange(db, rangeStart, todayEnd),
    options.includeCommunitySignals
      ? getPublicCrowdReportSignals(db, {})
      : Promise.resolve([]),
  ]);
  const candidateIssueIds = [...new Set(candidateIssueIdsInRange)];
  const communitySignalStationIds = [
    ...new Set(communitySignals.flatMap((signal) => signal.stationIds)),
  ];
  const needsIssueHydration =
    candidateIssueIds.length > 0 || communitySignalStationIds.length > 0;
  const issueHydration = needsIssueHydration
    ? await timeServerSpan('overview_active_issue_hydration', () =>
        getScopedIssueHydrationFromDb({
          db,
          issueIds: candidateIssueIds,
          lines,
          referenceNow: referenceDateTime,
          spanPrefix: 'overview',
          stationIds: communitySignalStationIds,
        }),
      )
    : null;
  const allIssues = issueHydration?.allIssues ?? {};
  const issues = Object.values(allIssues);
  const issueIdsActiveNow = issues
    .filter(
      (issue) =>
        issue.type === 'disruption' && issueActiveNow(issue, referenceDateTime),
    )
    .map((issue) => issue.id);
  const issueIdsActiveToday = issues
    .filter(
      (issue) =>
        (issue.type === 'maintenance' || issue.type === 'infra') &&
        issueActiveToday(issue, referenceDateTime),
    )
    .map((issue) => issue.id);
  const issuesByLineId = groupIssuesByLineId(issues);
  const lineSummaries = timeSyncServerSpan('overview_line_summaries', () =>
    buildFactBackedLineSummaries({
      days,
      facts: lineDayFacts as LineDayFactRow[],
      lines,
      publicHolidaySet,
      issuesByLineId,
      referenceNow: referenceDateTime,
    }),
  );
  const lineSummaryIssueIds = [
    ...new Set(
      lineSummaries.flatMap((summary) =>
        Object.values(summary.breakdownByDates).flatMap((entry) =>
          Object.values(entry.breakdownByIssueTypes).flatMap(
            (breakdown) => breakdown.issueIds,
          ),
        ),
      ),
    ),
  ];

  const baseIncluded = issueHydration?.included ?? emptyIncluded(lines);
  const selectedIncluded: IncludedEntities =
    issueHydration == null
      ? ({
          ...baseIncluded,
          issues: {},
        } satisfies IncludedEntities)
      : selectIncludedEntities(baseIncluded, allIssues, {
          issueIds: [
            ...new Set([
              ...issueIdsActiveNow,
              ...issueIdsActiveToday,
              ...lineSummaryIssueIds,
            ]),
          ],
          lineIds: lineSummaries.map((summary) => summary.lineId),
          stationIds: communitySignalStationIds,
          includeStationMembershipLines: true,
        });

  return {
    data: {
      issueIdsActiveNow,
      issueIdsActiveToday,
      lineSummaries,
      communitySignals,
    },
    included: {
      ...selectedIncluded,
      lines: {
        ...lines,
        ...selectedIncluded.lines,
      },
      issues: selectedIncluded.issues,
    },
  };
}
