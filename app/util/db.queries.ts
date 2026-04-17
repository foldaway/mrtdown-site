import { resolvePeriods } from '@mrtdown/core';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { DateTime, Interval } from 'luxon';
import type {
  Chart,
  ChartEntry,
  Granularity,
  IncludedEntities,
  Issue,
  IssueAffectedBranch,
  IssueInterval,
  IssueType,
  IssueUpdate,
  Line,
  LineBranch,
  LineProfile,
  LineSummary,
  LineSummaryDayType,
  LineSummaryStatus,
  Operator,
  OperatorLinePerformance,
  OperatorProfile,
  Station,
  StationProfile,
  SystemAnalytics,
  SystemOverview,
  TimeScale,
  TimeScaleChart,
} from '~/client';
import { getDb } from '~/db';
import {
  evidencesTable,
  impactEventCausesTable,
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventPeriodsTable,
  impactEventsTable,
  issueDayFactsTable,
  issuesTable,
  landmarksTable,
  lineDayFactsTable,
  lineOperatorsTable,
  linesTable,
  metadataTable,
  operatorsTable,
  publicHolidaysTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesTable,
  stationCodesTable,
  stationLandmarksTable,
  stationsTable,
  townsTable,
} from '~/db/schema';

const SG_TIMEZONE = 'Asia/Singapore';

type BaseIncludedEntities = Omit<IncludedEntities, 'issues'>;

type BranchWithEntries = LineBranch & {
  entries: Array<{
    stationId: string;
    displayCode: string;
    pathIndex: number;
  }>;
};

type BaseDataset = {
  included: BaseIncludedEntities;
  branchesByLineId: Record<string, BranchWithEntries[]>;
  branchByServiceId: Record<string, BranchWithEntries>;
  metadata: Record<string, string>;
  publicHolidaySet: Set<string>;
  allIssues: Record<string, Issue>;
  issueUpdatesById: Record<string, IssueUpdate[]>;
};

type IssueIntervalBounds = {
  start: DateTime;
  end: DateTime | null;
};

function nowSg() {
  return DateTime.now().setZone(SG_TIMEZONE);
}

function parseDateTime(value: string) {
  const iso = DateTime.fromISO(value, { setZone: true });
  if (iso.isValid) {
    return iso.setZone(SG_TIMEZONE);
  }

  const sqlDateTime = DateTime.fromSQL(value, { setZone: true });
  if (sqlDateTime.isValid) {
    return sqlDateTime.setZone(SG_TIMEZONE);
  }

  return DateTime.fromJSDate(new Date(value)).setZone(SG_TIMEZONE);
}

function parseTranslations(value: unknown) {
  const translations =
    value != null && typeof value === 'object'
      ? (value as Record<string, string>)
      : {};
  const fallback =
    translations['en-SG'] ??
    translations.en ??
    Object.values(translations)[0] ??
    '';
  return {
    fallback,
    translations,
  };
}

function mergeIntervals(intervals: IssueIntervalBounds[]) {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort(
    (a, b) => a.start.toMillis() - b.start.toMillis(),
  );
  const merged: IssueIntervalBounds[] = [];

  for (const interval of sorted) {
    const current = merged.at(-1);
    if (current == null) {
      merged.push({ ...interval });
      continue;
    }

    const currentEnd = current.end?.toMillis() ?? Number.POSITIVE_INFINITY;
    const nextEnd = interval.end?.toMillis() ?? Number.POSITIVE_INFINITY;

    if (interval.start.toMillis() <= currentEnd) {
      if (current.end == null || interval.end == null) {
        current.end = null;
      } else if (nextEnd > currentEnd) {
        current.end = interval.end;
      }
      continue;
    }

    merged.push({ ...interval });
  }

  return merged;
}

function sumIntervalSeconds(
  intervals: IssueIntervalBounds[],
  referenceNow = nowSg(),
) {
  return mergeIntervals(intervals).reduce((total, interval) => {
    const end = interval.end ?? referenceNow;
    return total + Math.max(0, end.diff(interval.start, 'seconds').seconds);
  }, 0);
}

function overlapSeconds(
  start: DateTime,
  end: DateTime | null,
  windowStart: DateTime,
  windowEnd: DateTime,
  referenceNow = nowSg(),
) {
  const boundedEnd = end ?? referenceNow;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = boundedEnd < windowEnd ? boundedEnd : windowEnd;
  return Math.max(0, overlapEnd.diff(overlapStart, 'seconds').seconds);
}

function classifyInterval(
  startAt: string,
  endAt: string | null,
  referenceNow = nowSg(),
): IssueInterval['status'] {
  const start = parseDateTime(startAt);
  if (start > referenceNow) {
    return 'future';
  }

  if (endAt == null) {
    return 'ongoing';
  }

  const end = parseDateTime(endAt);
  return end > referenceNow ? 'ongoing' : 'ended';
}

function buildIssueIntervals(
  rows: Array<{
    start_at: string;
    end_at_resolved: string | null;
    end_at: string | null;
  }>,
  referenceNow = nowSg(),
) {
  const unique = new Map<string, IssueInterval>();

  for (const row of rows) {
    const normalizedStartAt = parseDateTime(row.start_at).toISO()!;
    const resolvedEndAtRaw = row.end_at_resolved ?? row.end_at ?? null;
    const normalizedEndAt =
      resolvedEndAtRaw != null ? parseDateTime(resolvedEndAtRaw).toISO()! : null;
    const key = `${normalizedStartAt}::${normalizedEndAt ?? 'null'}`;
    if (unique.has(key)) {
      continue;
    }

    unique.set(key, {
      startAt: normalizedStartAt,
      endAt: normalizedEndAt,
      status: classifyInterval(normalizedStartAt, normalizedEndAt, referenceNow),
    });
  }

  return [...unique.values()].sort((a, b) => {
    return parseDateTime(a.startAt).toMillis() - parseDateTime(b.startAt).toMillis();
  });
}

function resolveOperationalIssueIntervals(
  rows: Array<{
    start_at: string;
    end_at: string | null;
  }>,
  lastEvidenceAt: DateTime | null,
  asOf = nowSg(),
) {
  if (rows.length === 0) {
    return [];
  }

  const resolved = resolvePeriods({
    periods: rows.map((row) => ({
      kind: 'fixed' as const,
      startAt: parseDateTime(row.start_at).toISO()!,
      endAt: row.end_at != null ? parseDateTime(row.end_at).toISO()! : null,
    })),
    asOf: asOf.toISO()!,
    mode: {
      kind: 'operational',
      lastEvidenceAt: lastEvidenceAt?.toISO() ?? null,
    },
  });

  return buildIssueIntervals(
    resolved.map((period) => ({
      start_at: period.startAt,
      end_at_resolved: period.endAtResolved,
      end_at: period.endAt,
    })),
    asOf,
  );
}

function lineDayType(
  date: DateTime,
  publicHolidaySet: Set<string>,
): LineSummaryDayType {
  if (publicHolidaySet.has(date.toISODate()!)) {
    return 'public_holiday';
  }
  return date.weekday >= 6 ? 'weekend' : 'weekday';
}

function serviceWindowForDate(
  line: Line,
  date: DateTime,
  publicHolidaySet: Set<string>,
) {
  const dayType = lineDayType(date, publicHolidaySet);
  const hours =
    dayType === 'weekday'
      ? line.operatingHours.weekdays
      : line.operatingHours.weekends;

  const [startHour, startMinute] = hours.start.split(':').map(Number);
  const [endHour, endMinute] = hours.end.split(':').map(Number);

  const windowStart = date.startOf('day').set({
    hour: startHour,
    minute: startMinute,
  });
  let windowEnd = date.startOf('day').set({
    hour: endHour,
    minute: endMinute,
  });
  if (windowEnd <= windowStart) {
    windowEnd = windowEnd.plus({ day: 1 });
  }

  return {
    start: windowStart,
    end: windowEnd,
    seconds: Math.max(0, windowEnd.diff(windowStart, 'seconds').seconds),
  };
}

function isLineFuture(line: Line, referenceNow = nowSg()) {
  if (line.startedAt == null) {
    return false;
  }
  return parseDateTime(line.startedAt) > referenceNow;
}

function isLineOperatingNow(
  line: Line,
  publicHolidaySet: Set<string>,
  referenceNow = nowSg(),
) {
  if (isLineFuture(line, referenceNow)) {
    return false;
  }

  if (line.startedAt != null) {
    const start = parseDateTime(line.startedAt);
    if (referenceNow < start) {
      return false;
    }
  }

  const window = serviceWindowForDate(line, referenceNow, publicHolidaySet);
  return referenceNow >= window.start && referenceNow <= window.end;
}

function pickIssueTypes<T extends { type: IssueType }>(items: T[]) {
  const counts: Partial<Record<IssueType, number>> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

function pickIssueDurationByType<
  T extends { type: IssueType; durationSeconds: number },
>(items: T[]) {
  const counts: Partial<Record<IssueType, number>> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + item.durationSeconds;
  }
  return counts;
}

function getIssueBounds(issue: Issue): IssueIntervalBounds[] {
  return issue.intervals.map((interval) => ({
    start: parseDateTime(interval.startAt),
    end: interval.endAt != null ? parseDateTime(interval.endAt) : null,
  }));
}

function issueTouchesDate(issue: Issue, date: DateTime) {
  const dayStart = date.startOf('day');
  const dayEnd = dayStart.plus({ day: 1 });
  return getIssueBounds(issue).some((interval) => {
    return overlapSeconds(interval.start, interval.end, dayStart, dayEnd) > 0;
  });
}

function issueOverlapsRange(
  issue: Issue,
  rangeStart: DateTime,
  rangeEnd: DateTime,
) {
  return getIssueBounds(issue).some((interval) => {
    return overlapSeconds(interval.start, interval.end, rangeStart, rangeEnd) > 0;
  });
}

function issueActiveNow(issue: Issue, referenceNow = nowSg()) {
  return issue.intervals.some((interval) => interval.status === 'ongoing');
}

function issueActiveToday(issue: Issue, referenceNow = nowSg()) {
  const dayStart = referenceNow.startOf('day');
  const dayEnd = dayStart.plus({ day: 1 });
  return getIssueBounds(issue).some((interval) => {
    return overlapSeconds(interval.start, interval.end, dayStart, dayEnd) > 0;
  });
}

function sortIssuesByLatestActivity(
  issueIds: string[],
  issuesById: Record<string, Issue>,
) {
  return [...issueIds].sort((a, b) => {
    const issueA = issuesById[a];
    const issueB = issuesById[b];
    const latestA = Math.max(
      ...issueA.intervals.map((interval) =>
        parseDateTime(interval.endAt ?? interval.startAt).toMillis(),
      ),
    );
    const latestB = Math.max(
      ...issueB.intervals.map((interval) =>
        parseDateTime(interval.endAt ?? interval.startAt).toMillis(),
      ),
    );
    return latestB - latestA;
  });
}

function makeTimeScale(granularity: Granularity, count: number): TimeScale {
  return { granularity, count };
}

function buildCountChart(
  title: string,
  entries: ChartEntry[],
  cumulative: ChartEntry[],
  dataTimeScale: TimeScale,
  displayTimeScale?: TimeScale,
): TimeScaleChart {
  return {
    title,
    data: entries,
    dataCumulative: cumulative,
    dataTimeScale,
    displayTimeScale,
  };
}

async function buildBaseDataset(referenceNow = nowSg()): Promise<BaseDataset> {
  const db = getDb();

  const [
    metadataRows,
    linesRows,
    lineOperatorsRows,
    operatorsRows,
    townsRows,
    landmarksRows,
    stationRows,
    stationCodesRows,
    stationLandmarksRows,
    serviceRows,
    serviceRevisionRows,
    servicePathRows,
    publicHolidayRows,
    issueRows,
    evidenceRows,
    impactEventRows,
    impactEventPeriodRows,
    impactEventServiceRows,
    impactEventFacilityRows,
    impactEventCauseRows,
  ] = await Promise.all([
    db.select().from(metadataTable),
    db.select().from(linesTable),
    db.select().from(lineOperatorsTable),
    db.select().from(operatorsTable),
    db.select().from(townsTable),
    db.select().from(landmarksTable),
    db
      .select({
        id: stationsTable.id,
        name: stationsTable.name,
        townId: stationsTable.townId,
        latitude: sql<number>`ST_Y(${stationsTable.geo})`,
        longitude: sql<number>`ST_X(${stationsTable.geo})`,
      })
      .from(stationsTable),
    db.select().from(stationCodesTable),
    db.select().from(stationLandmarksTable),
    db.select().from(servicesTable),
    db.select().from(serviceRevisionsTable),
    db.select().from(serviceRevisionPathStationEntriesTable),
    db.select().from(publicHolidaysTable),
    db.select().from(issuesTable),
    db.select().from(evidencesTable),
    db.select().from(impactEventsTable),
    db.select().from(impactEventPeriodsTable),
    db.select().from(impactEventEntityServicesTable),
    db.select().from(impactEventEntityFacilitiesTable),
    db.select().from(impactEventCausesTable),
  ]);

  const metadata = Object.fromEntries(
    metadataRows.map((row) => [row.key, row.value]),
  );
  const publicHolidaySet = new Set(publicHolidayRows.map((row) => row.date));

  const operatorsById = Object.fromEntries(
    operatorsRows.map((row) => {
      const { fallback, translations } = parseTranslations(row.name);
      const operator: Operator = {
        id: row.id,
        name: fallback,
        nameTranslations: translations,
        foundedAt: row.founded_at,
        url: row.url,
      };
      return [row.id, operator];
    }),
  );

  const townsById = Object.fromEntries(
    townsRows.map((row) => {
      const { fallback, translations } = parseTranslations(row.name);
      return [
        row.id,
        {
          id: row.id,
          name: fallback,
          nameTranslations: translations,
        },
      ];
    }),
  ) as IncludedEntities['towns'];

  const landmarksById = Object.fromEntries(
    landmarksRows.map((row) => {
      const { fallback, translations } = parseTranslations(row.name);
      return [
        row.id,
        {
          id: row.id,
          name: fallback,
          nameTranslations: translations,
        },
      ];
    }),
  ) as IncludedEntities['landmarks'];

  const operatorIdsByLineId = lineOperatorsRows.reduce<
    Record<string, Line['operators']>
  >((acc, row) => {
    if (acc[row.line_id] == null) {
      acc[row.line_id] = [];
    }
    acc[row.line_id].push({
      operatorId: row.operator_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    });
    return acc;
  }, {});

  const linesById = Object.fromEntries(
    linesRows.map((row) => {
      const { fallback, translations } = parseTranslations(row.name);
      const line: Line = {
        id: row.id,
        title: fallback,
        titleTranslations: translations,
        type: row.type,
        color: row.color,
        startedAt: row.started_at,
        operatingHours: row.operating_hours,
        operators: operatorIdsByLineId[row.id] ?? [],
      };
      return [row.id, line];
    }),
  ) as IncludedEntities['lines'];

  const revisionsByServiceId = serviceRevisionRows.reduce<
    Record<string, typeof serviceRevisionRows>
  >((acc, row) => {
    if (acc[row.service_id] == null) {
      acc[row.service_id] = [];
    }
    acc[row.service_id].push(row);
    return acc;
  }, {});

  const pathEntriesByRevisionKey = servicePathRows.reduce<
    Record<string, typeof servicePathRows>
  >((acc, row) => {
    const key = `${row.service_revision_id}::${row.service_id}`;
    if (acc[key] == null) {
      acc[key] = [];
    }
    acc[key].push(row);
    return acc;
  }, {});

  const stationCodeLookup = new Map<
    string,
    (typeof stationCodesRows)[number]
  >();
  const serviceById = Object.fromEntries(
    serviceRows.map((service) => [service.id, service]),
  ) as Record<string, (typeof serviceRows)[number]>;
  for (const row of stationCodesRows) {
    stationCodeLookup.set(
      `${row.station_id}::${row.line_id}::${row.code}`,
      row,
    );
  }

  const branchesByLineId: Record<string, BranchWithEntries[]> = {};
  const branchByServiceId: Record<string, BranchWithEntries> = {};

  for (const service of serviceRows) {
    const revisions = revisionsByServiceId[service.id] ?? [];
    if (revisions.length === 0) {
      continue;
    }

    const latestRevision = [...revisions].sort((a, b) => {
      const aTs = new Date(a.updated_at).getTime();
      const bTs = new Date(b.updated_at).getTime();
      if (aTs !== bTs) {
        return bTs - aTs;
      }
      return b.id.localeCompare(a.id);
    })[0];

    const revisionKey = `${latestRevision.id}::${service.id}`;
    const entries = [...(pathEntriesByRevisionKey[revisionKey] ?? [])].sort(
      (a, b) => a.path_index - b.path_index,
    );

    if (entries.length === 0) {
      continue;
    }

    const startedDates = entries
      .map(
        (entry) =>
          stationCodeLookup.get(
            `${entry.station_id}::${service.line_id}::${entry.display_code}`,
          )?.started_at,
      )
      .filter((value): value is string => value != null)
      .map((value) => parseDateTime(value));

    const endedDates = entries
      .map(
        (entry) =>
          stationCodeLookup.get(
            `${entry.station_id}::${service.line_id}::${entry.display_code}`,
          )?.ended_at,
      )
      .filter((value): value is string => value != null)
      .map((value) => parseDateTime(value));

    const { fallback, translations } = parseTranslations(service.name);
    const referenceNow = nowSg();
    const minStart = startedDates.sort(
      (a, b) => a.toMillis() - b.toMillis(),
    )[0];
    const allStartsInFuture =
      minStart != null && startedDates.every((date) => date > referenceNow);
    const branch: BranchWithEntries = {
      id: service.id,
      title: fallback,
      titleTranslations: translations,
      startedAt:
        minStart != null && !allStartsInFuture ? minStart.toISODate() : null,
      endedAt:
        endedDates.length === entries.length
          ? (endedDates
              .sort((a, b) => b.toMillis() - a.toMillis())[0]
              ?.toISODate() ?? null)
          : null,
      stationIds: [...new Set(entries.map((entry) => entry.station_id))],
      entries: entries.map((entry) => ({
        stationId: entry.station_id,
        displayCode: entry.display_code,
        pathIndex: entry.path_index,
      })),
    };

    branchByServiceId[service.id] = branch;
    if (branchesByLineId[service.line_id] == null) {
      branchesByLineId[service.line_id] = [];
    }
    branchesByLineId[service.line_id].push(branch);
  }

  const membershipByStationId: Record<string, Station['memberships']> = {};

  for (const [lineId, branches] of Object.entries(branchesByLineId)) {
    for (const branch of branches) {
      branch.entries.forEach((entry, index) => {
        if (membershipByStationId[entry.stationId] == null) {
          membershipByStationId[entry.stationId] = [];
        }

        const codeInfo = stationCodeLookup.get(
          `${entry.stationId}::${lineId}::${entry.displayCode}`,
        );

        const membership = {
          lineId,
          branchId: branch.id,
          code: entry.displayCode,
          startedAt:
            codeInfo?.started_at ??
            linesById[lineId]?.startedAt ??
            '1970-01-01',
          endedAt: codeInfo?.ended_at ?? undefined,
          structureType: codeInfo?.structure_type ?? 'underground',
          sequenceOrder: index,
        };

        const existing = membershipByStationId[entry.stationId].some(
          (candidate) =>
            candidate.lineId === membership.lineId &&
            candidate.branchId === membership.branchId &&
            candidate.code === membership.code,
        );
        if (!existing) {
          membershipByStationId[entry.stationId].push(membership);
        }
      });
    }
  }

  for (const code of stationCodesRows) {
    if (membershipByStationId[code.station_id] == null) {
      membershipByStationId[code.station_id] = [];
    }

    const existing = membershipByStationId[code.station_id].some(
      (membership) =>
        membership.lineId === code.line_id && membership.code === code.code,
    );
    if (existing) {
      continue;
    }

    membershipByStationId[code.station_id].push({
      lineId: code.line_id,
      branchId: `${code.line_id}:${code.code}`,
      code: code.code,
      startedAt: code.started_at,
      endedAt: code.ended_at ?? undefined,
      structureType: code.structure_type,
      sequenceOrder: 0,
    });
  }

  const landmarkIdsByStationId = stationLandmarksRows.reduce<
    Record<string, string[]>
  >((acc, row) => {
    if (acc[row.station_id] == null) {
      acc[row.station_id] = [];
    }
    acc[row.station_id].push(row.landmark_id);
    return acc;
  }, {});

  const stationsById = Object.fromEntries(
    stationRows.map((row) => {
      const { fallback, translations } = parseTranslations(row.name);
      const station: Station = {
        id: row.id,
        name: fallback,
        nameTranslations: translations,
        geo: {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        },
        memberships: (membershipByStationId[row.id] ?? []).sort((a, b) => {
          if (a.lineId !== b.lineId) {
            return a.lineId.localeCompare(b.lineId);
          }
          return a.sequenceOrder - b.sequenceOrder;
        }),
        townId: row.townId,
        landmarkIds: landmarkIdsByStationId[row.id] ?? [],
      };
      return [row.id, station];
    }),
  ) as IncludedEntities['stations'];

  const impactEventsByIssueId = impactEventRows.reduce<
    Record<string, typeof impactEventRows>
  >((acc, row) => {
    if (acc[row.issue_id] == null) {
      acc[row.issue_id] = [];
    }
    acc[row.issue_id].push(row);
    return acc;
  }, {});

  const periodsByImpactEventId = impactEventPeriodRows.reduce<
    Record<string, typeof impactEventPeriodRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const serviceRowsByImpactEventId = impactEventServiceRows.reduce<
    Record<string, typeof impactEventServiceRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const facilityRowsByImpactEventId = impactEventFacilityRows.reduce<
    Record<string, typeof impactEventFacilityRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const causesByImpactEventId = impactEventCauseRows.reduce<
    Record<string, typeof impactEventCauseRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const evidenceByIssueId = evidenceRows.reduce<
    Record<string, typeof evidenceRows>
  >((acc, row) => {
    if (acc[row.issue_id] == null) {
      acc[row.issue_id] = [];
    }
    acc[row.issue_id].push(row);
    return acc;
  }, {});
  const latestEvidenceAtByIssueId = Object.fromEntries(
    Object.entries(evidenceByIssueId).map(([issueId, rows]) => [
      issueId,
      rows
        .map((row) => parseDateTime(row.ts))
        .sort((a, b) => b.toMillis() - a.toMillis())[0] ?? null,
    ]),
  ) as Record<string, DateTime | null>;

  const allIssues: Record<string, Issue> = {};
  const issueUpdatesById: Record<string, IssueUpdate[]> = {};
  for (const row of issueRows) {
    const { fallback, translations } = parseTranslations(row.title);
    const events = [...(impactEventsByIssueId[row.id] ?? [])].sort((a, b) => {
      const tsDiff = parseDateTime(b.ts).toMillis() - parseDateTime(a.ts).toMillis();
      if (tsDiff !== 0) {
        return tsDiff;
      }
      return b.id.localeCompare(a.id);
    });
    const latestEventByType = events.reduce<
      Partial<Record<(typeof events)[number]['type'], (typeof events)[number]>>
    >((acc, event) => {
      if (acc[event.type] == null) {
        acc[event.type] = event;
      }
      return acc;
    }, {});
    const selectedStateEvents = [
      latestEventByType['periods.set'],
      latestEventByType['causes.set'],
      latestEventByType['service_scopes.set'],
      latestEventByType['service_effects.set'],
      latestEventByType['facility_effects.set'],
    ].filter((event): event is (typeof events)[number] => event != null);
    const serviceBranches = new Map<string, IssueAffectedBranch>();
    const facilityBranches = new Map<string, IssueAffectedBranch>();
    const causeSet = new Set<Issue['subtypes'][number]>();

    const periodEvents =
      latestEventByType['periods.set'] != null
        ? [latestEventByType['periods.set']]
        : [];
    const canonicalPeriods = periodEvents.flatMap((event) => {
      return periodsByImpactEventId[event.id] ?? [];
    });

    for (const event of selectedStateEvents) {
      for (const cause of causesByImpactEventId[event.id] ?? []) {
        causeSet.add(cause.type as Issue['subtypes'][number]);
      }

      for (const serviceRef of serviceRowsByImpactEventId[event.id] ?? []) {
        const branch = branchByServiceId[serviceRef.service_id];
        const service = serviceById[serviceRef.service_id];
        if (branch == null || service == null) {
          continue;
        }
        serviceBranches.set(branch.id, {
          lineId: service.line_id,
          branchId: branch.id,
          stationIds: branch.stationIds,
        });
      }

      for (const facilityRef of facilityRowsByImpactEventId[event.id] ?? []) {
        const station = stationsById[facilityRef.station_id];
        if (station == null) {
          continue;
        }

        const stationMemberships =
          station.memberships.length > 0 ? station.memberships : [];
        for (const membership of stationMemberships) {
          const key = `${membership.lineId}::${station.id}`;
          if (!facilityBranches.has(key)) {
            facilityBranches.set(key, {
              lineId: membership.lineId,
              branchId: `${membership.lineId}:${station.id}`,
              stationIds: [station.id],
            });
          }
        }
      }
    }

    const branchesAffected = [
      ...serviceBranches.values(),
      ...facilityBranches.values(),
    ]
      .map((branch) => {
        if (branch.lineId !== '') {
          return branch;
        }
        const resolvedBranch = branchByServiceId[branch.branchId];
        return {
          ...branch,
          lineId:
            resolvedBranch != null
              ? (serviceRows.find((service) => service.id === resolvedBranch.id)
                  ?.line_id ?? branch.lineId)
              : branch.lineId,
        };
      })
      .filter((branch) => branch.lineId !== '');

    const lineIds = [
      ...new Set(branchesAffected.map((branch) => branch.lineId)),
    ];
    const latestEvidenceAt = latestEvidenceAtByIssueId[row.id];
    const intervals = resolveOperationalIssueIntervals(
      canonicalPeriods.map((period) => ({
        start_at: period.start_at,
        end_at: period.end_at,
      })),
      row.type === 'infra' ? null : latestEvidenceAt,
      referenceNow,
    );

    const durationSeconds = sumIntervalSeconds(
      intervals.map((interval) => ({
        start: parseDateTime(interval.startAt),
        end: interval.endAt != null ? parseDateTime(interval.endAt) : null,
      })),
      referenceNow,
    );

    allIssues[row.id] = {
      id: row.id,
      title: fallback,
      titleTranslations: translations,
      type: row.type,
      subtypes: [...causeSet],
      durationSeconds,
      lineIds,
      branchesAffected,
      intervals,
    };

    issueUpdatesById[row.id] = [...(evidenceByIssueId[row.id] ?? [])]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .map((evidence) => ({
        type: evidence.type,
        text: evidence.text,
        textTranslations: evidence.render?.text ?? null,
        sourceUrl: evidence.source_url,
        createdAt: evidence.ts,
      }));
  }

  return {
    included: {
      lines: linesById,
      stations: stationsById,
      operators: operatorsById,
      towns: townsById,
      landmarks: landmarksById,
    },
    branchesByLineId,
    branchByServiceId,
    metadata,
    publicHolidaySet,
    allIssues,
    issueUpdatesById,
  };
}

function withIssues(
  baseIncluded: BaseIncludedEntities,
  allIssues: Record<string, Issue>,
  issueIds?: string[],
): IncludedEntities {
  const selectedIssues =
    issueIds == null
      ? allIssues
      : Object.fromEntries(
          issueIds
            .filter((issueId) => allIssues[issueId] != null)
            .map((issueId) => [issueId, allIssues[issueId]]),
        );

  return {
    ...baseIncluded,
    issues: selectedIssues,
  };
}

function buildLineSummary(
  line: Line,
  issues: Issue[],
  days: number,
  publicHolidaySet: Set<string>,
  referenceNow = nowSg(),
): LineSummary {
  const startDate = referenceNow.startOf('day').minus({ days: days - 1 });
  const breakdownByDates: LineSummary['breakdownByDates'] = {};
  const durationSecondsByIssueType: Partial<Record<IssueType, number>> = {};

  let totalServiceSeconds = 0;
  let totalDowntimeSeconds = 0;

  for (let offset = 0; offset < days; offset++) {
    const date = startDate.plus({ days: offset });
    const dayWindow = serviceWindowForDate(line, date, publicHolidaySet);
    const dayBreakdown: LineSummary['breakdownByDates'][string] = {
      breakdownByIssueTypes: {},
      dayType: lineDayType(date, publicHolidaySet),
    };

    if (!isLineFuture(line, date.endOf('day'))) {
      totalServiceSeconds += dayWindow.seconds;
    }

    const dailyDowntimeIntervals: IssueIntervalBounds[] = [];

    for (const issue of issues) {
      const issueBounds = getIssueBounds(issue);
      const contributingBounds: IssueIntervalBounds[] = [];
      const dayOverlap = issueBounds.reduce((total, interval) => {
        const clippedStart =
          interval.start > dayWindow.start ? interval.start : dayWindow.start;
        const intervalEnd = interval.end ?? referenceNow;
        const clippedEnd =
          intervalEnd < dayWindow.end ? intervalEnd : dayWindow.end;
        if (clippedEnd > clippedStart) {
          contributingBounds.push({
            start: clippedStart,
            end: clippedEnd,
          });
        }
        return (
          total +
          overlapSeconds(
            interval.start,
            interval.end,
            dayWindow.start,
            dayWindow.end,
            referenceNow,
          )
        );
      }, 0);

      if (dayOverlap <= 0) {
        continue;
      }

      durationSecondsByIssueType[issue.type] =
        (durationSecondsByIssueType[issue.type] ?? 0) + dayOverlap;

      if (issue.type === 'disruption' || issue.type === 'maintenance') {
        dailyDowntimeIntervals.push(...contributingBounds);
      }

      const current = dayBreakdown.breakdownByIssueTypes[issue.type] ?? {
        totalDurationSeconds: 0,
        issueIds: [],
      };
      current.totalDurationSeconds += dayOverlap;
      if (!current.issueIds.includes(issue.id)) {
        current.issueIds.push(issue.id);
      }
      dayBreakdown.breakdownByIssueTypes[issue.type] = current;
    }

    totalDowntimeSeconds += sumIntervalSeconds(
      dailyDowntimeIntervals,
      referenceNow,
    );

    breakdownByDates[date.toISODate()!] = dayBreakdown;
  }

  const activeNow = issues.filter((issue) =>
    issueActiveNow(issue, referenceNow),
  );
  let status: LineSummaryStatus = 'normal';
  if (isLineFuture(line, referenceNow)) {
    status = 'future_service';
  } else if (!isLineOperatingNow(line, publicHolidaySet, referenceNow)) {
    status = 'closed_for_day';
  } else if (activeNow.some((issue) => issue.type === 'disruption')) {
    status = 'ongoing_disruption';
  } else if (activeNow.some((issue) => issue.type === 'maintenance')) {
    status = 'ongoing_maintenance';
  } else if (activeNow.some((issue) => issue.type === 'infra')) {
    status = 'ongoing_infra';
  }

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
    totalDowntimeSeconds: totalServiceSeconds > 0 ? totalDowntimeSeconds : null,
    downtimeBreakdown:
      totalServiceSeconds > 0
        ? (['disruption', 'maintenance', 'infra'] as IssueType[]).map(
            (type) => ({
              type,
              downtimeSeconds: durationSecondsByIssueType[type] ?? 0,
            }),
          )
        : null,
    uptimeRank: null,
    totalLines: null,
  };
}

function rankLineSummaries(lineSummaries: LineSummary[]) {
  const ranked = lineSummaries
    .filter((summary) => summary.uptimeRatio != null)
    .sort((a, b) => (b.uptimeRatio ?? 0) - (a.uptimeRatio ?? 0));

  return lineSummaries.map((summary) => {
    const rank = ranked.findIndex((item) => item.lineId === summary.lineId);
    return {
      ...summary,
      uptimeRank: summary.uptimeRatio != null ? rank + 1 : null,
      totalLines: ranked.length > 0 ? ranked.length : null,
    };
  });
}

function buildWindowCountEntries(
  issues: Issue[],
  start: DateTime,
  count: number,
  stepUnit: Granularity,
  durationMode = false,
) {
  const entries: ChartEntry[] = [];

  for (let index = 0; index < count; index++) {
    const bucketStart = start.plus({ [stepUnit]: index } as Record<
      Granularity,
      number
    >);
    const bucketEnd = bucketStart.plus({ [stepUnit]: 1 } as Record<
      Granularity,
      number
    >);
    const payload: Record<string, number> = {
      disruption: 0,
      maintenance: 0,
      infra: 0,
    };

    for (const issue of issues) {
      if (!durationMode) {
        const firstStart = issue.intervals[0]?.startAt;
        if (firstStart == null) {
          continue;
        }

        const firstStartAt = parseDateTime(firstStart);
        if (firstStartAt >= bucketStart && firstStartAt < bucketEnd) {
          payload[issue.type] += 1;
        }
        continue;
      }

      const seconds = getIssueBounds(issue).reduce((total, interval) => {
        return (
          total +
          overlapSeconds(interval.start, interval.end, bucketStart, bucketEnd)
        );
      }, 0);
      payload[issue.type] += seconds;
    }

    entries.push({
      name: bucketStart.toISODate()!,
      payload,
    });
  }

  return entries;
}

function buildPreviousWindowSummary(
  issues: Issue[],
  currentStart: DateTime,
  count: number,
  stepUnit: Granularity,
  durationMode = false,
) {
  const currentEntries = buildWindowCountEntries(
    issues,
    currentStart,
    count,
    stepUnit,
    durationMode,
  );
  const previousStart = currentStart.minus({ [stepUnit]: count } as Record<
    Granularity,
    number
  >);
  const previousEntries = buildWindowCountEntries(
    issues,
    previousStart,
    count,
    stepUnit,
    durationMode,
  );

  const summarize = (entries: ChartEntry[]) => {
    return entries.reduce<Record<string, number>>(
      (acc, entry) => {
        acc.disruption += entry.payload.disruption ?? 0;
        acc.maintenance += entry.payload.maintenance ?? 0;
        acc.infra += entry.payload.infra ?? 0;
        return acc;
      },
      { disruption: 0, maintenance: 0, infra: 0 },
    );
  };

  return {
    data: currentEntries,
    cumulative: [
      {
        name: 'current',
        payload: summarize(currentEntries),
      },
      {
        name: 'previous',
        payload: summarize(previousEntries),
      },
    ],
  };
}

function buildUptimeGraph(
  line: Line,
  issues: Issue[],
  publicHolidaySet: Set<string>,
  count: number,
): TimeScaleChart {
  const end = nowSg().startOf('day');
  const start = end.minus({ days: count - 1 });
  const data: ChartEntry[] = [];

  for (let offset = 0; offset < count; offset++) {
    const date = start.plus({ days: offset });
    const serviceWindow = serviceWindowForDate(line, date, publicHolidaySet);
    let breakdownDisruption = 0;
    let breakdownMaintenance = 0;
    let breakdownInfra = 0;

    for (const issue of issues) {
      const overlap = getIssueBounds(issue).reduce((total, interval) => {
        return (
          total +
          overlapSeconds(
            interval.start,
            interval.end,
            serviceWindow.start,
            serviceWindow.end,
          )
        );
      }, 0);
      if (overlap <= 0) {
        continue;
      }

      if (issue.type === 'disruption') breakdownDisruption += overlap;
      if (issue.type === 'maintenance') breakdownMaintenance += overlap;
      if (issue.type === 'infra') breakdownInfra += overlap;
    }

    const totalDowntime = breakdownDisruption + breakdownMaintenance;
    data.push({
      name: date.toISODate()!,
      payload: {
        uptimeRatio:
          serviceWindow.seconds > 0
            ? Math.max(0, 1 - totalDowntime / serviceWindow.seconds)
            : 1,
        'breakdown.disruption': breakdownDisruption,
        'breakdown.maintenance': breakdownMaintenance,
        'breakdown.infra': breakdownInfra,
      },
    });
  }

  const buildAggregate = (windowStart: DateTime, windowCount: number) => {
    let serviceSeconds = 0;
    let downtime = 0;
    for (let offset = 0; offset < windowCount; offset++) {
      const date = windowStart.plus({ days: offset });
      const serviceWindow = serviceWindowForDate(line, date, publicHolidaySet);
      serviceSeconds += serviceWindow.seconds;
      for (const issue of issues) {
        if (issue.type === 'infra') {
          continue;
        }
        downtime += getIssueBounds(issue).reduce((total, interval) => {
          return (
            total +
            overlapSeconds(
              interval.start,
              interval.end,
              serviceWindow.start,
              serviceWindow.end,
            )
          );
        }, 0);
      }
    }
    return serviceSeconds > 0 ? Math.max(0, 1 - downtime / serviceSeconds) : 1;
  };

  return buildCountChart(
    `${count}d`,
    data,
    [
      {
        name: 'current',
        payload: { uptimeRatio: buildAggregate(start, count) },
      },
      {
        name: 'previous',
        payload: {
          uptimeRatio: buildAggregate(start.minus({ days: count }), count),
        },
      },
    ],
    makeTimeScale('day', count),
  );
}

function buildOperatorUptimeGraph(
  lines: Line[],
  issuesByLineId: Record<string, Issue[]>,
  publicHolidaySet: Set<string>,
  count: number,
): TimeScaleChart {
  const end = nowSg().startOf('day');
  const start = end.minus({ days: count - 1 });
  const data: ChartEntry[] = [];

  const computeWindow = (windowStart: DateTime, windowCount: number) => {
    let serviceSeconds = 0;
    let downtimeSeconds = 0;

    for (let offset = 0; offset < windowCount; offset++) {
      const date = windowStart.plus({ days: offset });

      for (const line of lines) {
        if (isLineFuture(line, date.endOf('day'))) {
          continue;
        }

        const serviceWindow = serviceWindowForDate(line, date, publicHolidaySet);
        serviceSeconds += serviceWindow.seconds;

        for (const issue of issuesByLineId[line.id] ?? []) {
          if (issue.type === 'infra') {
            continue;
          }

          downtimeSeconds += getIssueBounds(issue).reduce((total, interval) => {
            return (
              total +
              overlapSeconds(
                interval.start,
                interval.end,
                serviceWindow.start,
                serviceWindow.end,
              )
            );
          }, 0);
        }
      }
    }

    return {
      serviceSeconds,
      downtimeSeconds,
      uptimeRatio:
        serviceSeconds > 0
          ? Math.max(0, 1 - downtimeSeconds / serviceSeconds)
          : 1,
    };
  };

  for (let offset = 0; offset < count; offset++) {
    const date = start.plus({ days: offset });
    const summary = computeWindow(date, 1);
    data.push({
      name: date.toISODate()!,
      payload: { uptimeRatio: summary.uptimeRatio },
    });
  }

  const current = computeWindow(start, count);
  const previous = computeWindow(start.minus({ days: count }), count);

  return buildCountChart(
    `${count}d`,
    data,
    [
      { name: 'current', payload: { uptimeRatio: current.uptimeRatio } },
      { name: 'previous', payload: { uptimeRatio: previous.uptimeRatio } },
    ],
    makeTimeScale('day', count),
  );
}

function buildIssueCountGraphs(issues: Issue[]) {
  const end = nowSg().startOf('day');
  return [7, 30, 90].map((count) => {
    const start = end.minus({ days: count - 1 });
    const { data, cumulative } = buildPreviousWindowSummary(
      issues,
      start,
      count,
      'day',
      false,
    );
    return buildCountChart(
      `${count}d`,
      data,
      cumulative,
      makeTimeScale('day', count),
    );
  });
}

function buildIssueDurationGraphs(issues: Issue[]) {
  const end = nowSg().startOf('day');
  return [7, 30, 90].map((count) => {
    const start = end.minus({ days: count - 1 });
    const { data, cumulative } = buildPreviousWindowSummary(
      issues,
      start,
      count,
      'day',
      true,
    );
    return buildCountChart(
      `${count}d`,
      data,
      cumulative,
      makeTimeScale('day', count),
    );
  });
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildCountChartsFromIssueFacts(
  rows: Array<{
    date: string;
    issue_type: IssueType;
    duration_seconds: number;
    active_anytime: boolean;
  }>,
  durationMode = false,
) {
  const end = nowSg().startOf('day');
  const aggregateForRange = (
    start: DateTime,
    count: number,
    previous = false,
  ): Record<string, number> => {
    const rangeStart = previous
      ? start.minus({ days: count })
      : start;
    const rangeEnd = rangeStart.plus({ days: count });
    return rows.reduce<Record<string, number>>(
      (acc, row) => {
        const date = DateTime.fromISO(row.date, { zone: SG_TIMEZONE });
        if (date < rangeStart || date >= rangeEnd) {
          return acc;
        }

        if (durationMode) {
          acc[row.issue_type] += row.duration_seconds;
        } else if (row.active_anytime) {
          acc[row.issue_type] += 1;
        }
        return acc;
      },
      { disruption: 0, maintenance: 0, infra: 0 },
    );
  };

  return [7, 30, 90].map((count) => {
    const start = end.minus({ days: count - 1 });
    const data: ChartEntry[] = [];
    for (let offset = 0; offset < count; offset++) {
      const date = start.plus({ days: offset }).toISODate()!;
      const dayRows = rows.filter((row) => row.date === date);
      data.push({
        name: date,
        payload: dayRows.reduce<Record<string, number>>(
          (acc, row) => {
            acc[row.issue_type] += durationMode
              ? row.duration_seconds
              : row.active_anytime
                ? 1
                : 0;
            return acc;
          },
          { disruption: 0, maintenance: 0, infra: 0 },
        ),
      });
    }

    return buildCountChart(
      `${count}d`,
      data,
      [
        { name: 'current', payload: aggregateForRange(start, count, false) },
        { name: 'previous', payload: aggregateForRange(start, count, true) },
      ],
      makeTimeScale('day', count),
    );
  });
}

function isUndefinedTableError(error: unknown) {
  return (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '42P01'
  );
}

async function getIssueDayFactsInRange(start: DateTime, end: DateTime) {
  const db = getDb();
  try {
    return await db
      .select()
      .from(issueDayFactsTable)
      .where(
        and(
          gte(issueDayFactsTable.date, start.toISODate()!),
          lte(issueDayFactsTable.date, end.toISODate()!),
        ),
      );
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return [];
    }
    throw error;
  }
}

async function getLineDayFactsInRange(start: DateTime, end: DateTime) {
  const db = getDb();
  try {
    return await db
      .select()
      .from(lineDayFactsTable)
      .where(
        and(
          gte(lineDayFactsTable.date, start.toISODate()!),
          lte(lineDayFactsTable.date, end.toISODate()!),
        ),
      );
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return [];
    }
    throw error;
  }
}

function hasLineFactsCoverage(
  rows: Array<{ date: string; line_id: string }>,
  start: DateTime,
  end: DateTime,
  lineIds: string[],
) {
  if (lineIds.length === 0) {
    return false;
  }

  const expectedDates: string[] = [];
  for (
    let date = start.startOf('day');
    date <= end.startOf('day');
    date = date.plus({ days: 1 })
  ) {
    expectedDates.push(date.toISODate()!);
  }

  const rowKeys = new Set(rows.map((row) => `${row.date}::${row.line_id}`));
  return expectedDates.every((date) =>
    lineIds.every((lineId) => rowKeys.has(`${date}::${lineId}`)),
  );
}

export async function rebuildOperationalFactsForDate(date: DateTime) {
  const normalizedDate = date.setZone(SG_TIMEZONE).startOf('day');
  const asOf = normalizedDate.endOf('day');
  const dataset = await buildBaseDataset(asOf);
  const db = getDb();
  const dateKey = normalizedDate.toISODate()!;
  const dayEnd = normalizedDate.plus({ days: 1 });
  const issues = Object.values(dataset.allIssues);

  const issueRows = issues
    .map((issue) => {
      const durationSeconds = getIssueBounds(issue).reduce((total, interval) => {
        return (
          total +
          overlapSeconds(
            interval.start,
            interval.end,
            normalizedDate,
            dayEnd,
            asOf,
          )
        );
      }, 0);

      return {
        date: dateKey,
        issue_id: issue.id,
        issue_type: issue.type,
        as_of: asOf.toISO()!,
        active_anytime: durationSeconds > 0,
        active_end_of_day: issueActiveNow(issue, asOf),
        duration_seconds: Math.round(durationSeconds),
        inferred_interval_count: 0,
      };
    })
    .filter((row) => row.active_anytime || row.active_end_of_day);

  const lineRows = Object.values(dataset.included.lines).map((line) => {
    const lineIssues = issues.filter((issue) => issue.lineIds.includes(line.id));
    const summary = buildLineSummary(
      line,
      lineIssues,
      1,
      dataset.publicHolidaySet,
      asOf,
    );
    const dayBreakdown = summary.breakdownByDates[dateKey];
    const counts = lineIssues.reduce<Record<IssueType, number>>(
      (acc, issue) => {
        if (issueTouchesDate(issue, normalizedDate)) {
          acc[issue.type] += 1;
        }
        return acc;
      },
      { disruption: 0, maintenance: 0, infra: 0 },
    );

    return {
      date: dateKey,
      line_id: line.id,
      as_of: asOf.toISO()!,
      service_seconds: Math.round(
        isLineFuture(line, normalizedDate.endOf('day'))
          ? 0
          : serviceWindowForDate(line, normalizedDate, dataset.publicHolidaySet)
              .seconds,
      ),
      downtime_disruption_seconds: Math.round(
        dayBreakdown?.breakdownByIssueTypes.disruption?.totalDurationSeconds ?? 0,
      ),
      downtime_maintenance_seconds: Math.round(
        dayBreakdown?.breakdownByIssueTypes.maintenance?.totalDurationSeconds ?? 0,
      ),
      downtime_infra_seconds: Math.round(
        dayBreakdown?.breakdownByIssueTypes.infra?.totalDurationSeconds ?? 0,
      ),
      issue_count_disruption: counts.disruption,
      issue_count_maintenance: counts.maintenance,
      issue_count_infra: counts.infra,
    };
  });

  await db.delete(issueDayFactsTable).where(eq(issueDayFactsTable.date, dateKey));
  await db.delete(lineDayFactsTable).where(eq(lineDayFactsTable.date, dateKey));

  for (const batch of chunk(issueRows, 500)) {
    if (batch.length > 0) {
      await db.insert(issueDayFactsTable).values(batch);
    }
  }
  for (const batch of chunk(lineRows, 500)) {
    if (batch.length > 0) {
      await db.insert(lineDayFactsTable).values(batch);
    }
  }

  return {
    date: dateKey,
    issueCount: issueRows.length,
    lineCount: lineRows.length,
  };
}

export async function rebuildOperationalFactsRange(days: number, end = nowSg()) {
  const normalizedEnd = end.setZone(SG_TIMEZONE).startOf('day');
  const results: Array<{ date: string; issueCount: number; lineCount: number }> = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = normalizedEnd.minus({ days: offset });
    results.push(await rebuildOperationalFactsForDate(date));
  }
  return results;
}

export async function getRootData() {
  const dataset = await buildBaseDataset();
  return {
    lineIds: Object.keys(dataset.included.lines).sort(),
    included: withIssues(dataset.included, dataset.allIssues, []),
    metadata: Object.entries(dataset.metadata).map(([key, value]) => ({
      key,
      value,
    })),
    operatorIds: Object.keys(dataset.included.operators).sort(),
    operatorsIncluded: dataset.included.operators,
  };
}

export async function getOverviewData(days: number) {
  const dataset = await buildBaseDataset();
  const issues = Object.values(dataset.allIssues);
  const lineSummaries = rankLineSummaries(
    Object.values(dataset.included.lines).map((line) => {
      const lineIssues = issues.filter((issue) =>
        issue.lineIds.includes(line.id),
      );
      return buildLineSummary(line, lineIssues, days, dataset.publicHolidaySet);
    }),
  );

  const overview: SystemOverview = {
    issueIdsActiveNow: issues
      .filter(
        (issue) => issue.type === 'disruption' && issueActiveNow(issue),
      )
      .map((issue) => issue.id),
    issueIdsActiveToday: issues
      .filter(
        (issue) =>
          (issue.type === 'maintenance' || issue.type === 'infra') &&
          issueActiveToday(issue),
      )
      .map((issue) => issue.id),
    lineSummaries,
  };

  const overviewIssueIds = [
    ...new Set([
      ...overview.issueIdsActiveNow,
      ...overview.issueIdsActiveToday,
      ...overview.lineSummaries.flatMap((summary) =>
        Object.values(summary.breakdownByDates).flatMap((entry) =>
          Object.values(entry.breakdownByIssueTypes).flatMap(
            (breakdown) => breakdown.issueIds,
          ),
        ),
      ),
    ]),
  ];

  return {
    data: overview,
    included: withIssues(dataset.included, dataset.allIssues, overviewIssueIds),
  };
}

export async function getLineProfileData(lineId: string, days: number) {
  const dataset = await buildBaseDataset();
  const line = dataset.included.lines[lineId];
  if (line == null) {
    throw new Response('Line not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const allLineSummaries = rankLineSummaries(
    Object.values(dataset.included.lines).map((candidateLine) => {
      const candidateIssues = Object.values(dataset.allIssues).filter((issue) =>
        issue.lineIds.includes(candidateLine.id),
      );
      return buildLineSummary(
        candidateLine,
        candidateIssues,
        days,
        dataset.publicHolidaySet,
      );
    }),
  );

  const lineIssues = Object.values(dataset.allIssues).filter((issue) =>
    issue.lineIds.includes(lineId),
  );
  const rankedSummary = allLineSummaries.find(
    (summary) => summary.lineId === lineId,
  )!;
  const issueIdsRecent = [...lineIssues]
    .filter((issue) =>
      issue.intervals.some((interval) => parseDateTime(interval.startAt) <= nowSg()),
    )
    .sort((a, b) => {
      const earliestA = Math.min(
        ...a.intervals.map((interval) => parseDateTime(interval.startAt).toMillis()),
      );
      const earliestB = Math.min(
        ...b.intervals.map((interval) => parseDateTime(interval.startAt).toMillis()),
      );
      return earliestB - earliestA;
    })
    .slice(0, 5)
    .map((issue) => issue.id);

  const futureMaintenance = lineIssues
    .filter((issue) => issue.type === 'maintenance')
    .flatMap((issue) =>
      issue.intervals
        .filter((interval) => interval.status === 'future')
        .map((interval) => ({ issueId: issue.id, startAt: interval.startAt })),
    )
    .sort(
      (a, b) =>
        parseDateTime(a.startAt).toMillis() -
        parseDateTime(b.startAt).toMillis(),
    )[0];

  const stationIdsInterchanges = [
    ...new Set(
      Object.values(dataset.included.stations)
        .filter((station) => {
          const lineMemberships = station.memberships.filter(
            (membership) => membership.lineId === lineId,
          );
          if (lineMemberships.length === 0) {
            return false;
          }

          return station.memberships.some(
            (membership) => membership.lineId !== lineId,
          );
        })
        .map((station) => station.id),
    ),
  ];

  const profile: LineProfile = {
    lineId,
    lineSummary: rankedSummary,
    branches: dataset.branchesByLineId[lineId] ?? [],
    issueIdNextMaintenance: futureMaintenance?.issueId ?? null,
    issueIdsRecent,
    issueCountByType: pickIssueTypes(lineIssues),
    timeScaleGraphsIssueCount: buildIssueCountGraphs(lineIssues),
    timeScaleGraphsUptimeRatios: [7, 30, days].map((window) =>
      buildUptimeGraph(line, lineIssues, dataset.publicHolidaySet, window),
    ),
    stationIdsInterchanges,
  };

  return {
    data: profile,
    included: withIssues(dataset.included, dataset.allIssues, [
      ...new Set(
        [...issueIdsRecent, profile.issueIdNextMaintenance].filter(
          (value): value is string => value != null,
        ),
      ),
    ]),
  };
}

export async function getIssueData(issueId: string) {
  const dataset = await buildBaseDataset();
  const issue = dataset.allIssues[issueId];
  if (issue == null) {
    throw new Response('Issue not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  return {
    data: {
      id: issueId,
      updates: dataset.issueUpdatesById[issueId] ?? [],
    },
    included: withIssues(dataset.included, dataset.allIssues, [issueId]),
  };
}

export async function getStationProfileData(stationId: string) {
  const dataset = await buildBaseDataset();
  const station = dataset.included.stations[stationId];
  if (station == null) {
    throw new Response('Station not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const issues = Object.values(dataset.allIssues).filter((issue) =>
    issue.branchesAffected.some((branch) =>
      branch.stationIds.includes(stationId),
    ),
  );
  const activeNow = issues.filter((issue) => issueActiveNow(issue));

  let status: StationProfile['status'] = 'normal';
  if (activeNow.some((issue) => issue.type === 'disruption')) {
    status = 'ongoing_disruption';
  } else if (activeNow.some((issue) => issue.type === 'maintenance')) {
    status = 'ongoing_maintenance';
  } else if (activeNow.some((issue) => issue.type === 'infra')) {
    status = 'ongoing_infra';
  }

  const issueIdsRecent = sortIssuesByLatestActivity(
    issues.map((issue) => issue.id),
    dataset.allIssues,
  ).slice(0, 15);

  return {
    data: {
      stationId,
      status,
      issueIdsRecent,
      issueCountByType: pickIssueTypes(issues),
    } satisfies StationProfile,
    included: withIssues(dataset.included, dataset.allIssues, issueIdsRecent),
  };
}

export async function getOperatorProfileData(operatorId: string, days: number) {
  const dataset = await buildBaseDataset();
  const operator = dataset.included.operators[operatorId];
  if (operator == null) {
    throw new Response('Operator not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const lineIds = Object.values(dataset.included.lines)
    .filter((line) =>
      line.operators.some((entry) => entry.operatorId === operatorId),
    )
    .map((line) => line.id);

  const lineSummaries = Object.fromEntries(
    lineIds.map((lineId) => {
      const line = dataset.included.lines[lineId];
      const lineIssues = Object.values(dataset.allIssues).filter((issue) =>
        issue.lineIds.includes(lineId),
      );
      return [
        lineId,
        buildLineSummary(line, lineIssues, days, dataset.publicHolidaySet),
      ];
    }),
  ) as Record<string, LineSummary>;
  const operatorLines = lineIds.map((lineId) => dataset.included.lines[lineId]);
  const operatorIssuesByLineId = Object.fromEntries(
    lineIds.map((lineId) => [
      lineId,
      Object.values(dataset.allIssues).filter((issue) =>
        issue.lineIds.includes(lineId),
      ),
    ]),
  ) as Record<string, Issue[]>;

  const operatorIssues = Object.values(dataset.allIssues).filter((issue) =>
    issue.lineIds.some((lineId) => lineIds.includes(lineId)),
  );

  const totalStationsOperated = new Set(
    lineIds.flatMap((lineId) =>
      (dataset.branchesByLineId[lineId] ?? []).flatMap(
        (branch) => branch.stationIds,
      ),
    ),
  ).size;

  const linePerformanceComparison: OperatorLinePerformance[] = lineIds.map(
    (lineId) => ({
      lineId,
      status: lineSummaries[lineId].status,
      uptimeRatio: lineSummaries[lineId].uptimeRatio,
      issueCount: operatorIssues.filter((issue) =>
        issue.lineIds.includes(lineId),
      ).length,
    }),
  );

  const activeSummaries = Object.values(lineSummaries);
  const linesAffected = activeSummaries
    .filter((summary) =>
      ['ongoing_disruption', 'ongoing_maintenance', 'ongoing_infra'].includes(
        summary.status,
      ),
    )
    .map((summary) => summary.lineId);

  let currentOperationalStatus: OperatorProfile['currentOperationalStatus'] =
    'all_operational';
  if (
    activeSummaries.length > 0 &&
    activeSummaries.every((summary) =>
      ['closed_for_day', 'future_service'].includes(summary.status),
    )
  ) {
    currentOperationalStatus = 'all_lines_closed_for_day';
  } else if (
    activeSummaries.some((summary) => summary.status === 'ongoing_disruption')
  ) {
    currentOperationalStatus = 'some_lines_disrupted';
  } else if (
    activeSummaries.some((summary) =>
      ['ongoing_maintenance', 'ongoing_infra'].includes(summary.status),
    )
  ) {
    currentOperationalStatus = 'some_lines_under_maintenance';
  }

  const totalServiceSeconds = activeSummaries.reduce(
    (sum, summary) => sum + (summary.totalServiceSeconds ?? 0),
    0,
  );
  const totalDowntimeSeconds = activeSummaries.reduce(
    (sum, summary) => sum + (summary.totalDowntimeSeconds ?? 0),
    0,
  );

  const profile: OperatorProfile = {
    operatorId,
    lineIds,
    aggregateUptimeRatio:
      totalServiceSeconds > 0
        ? Math.max(0, 1 - totalDowntimeSeconds / totalServiceSeconds)
        : null,
    currentOperationalStatus,
    linesAffected,
    totalIssuesByType: pickIssueTypes(operatorIssues),
    totalStationsOperated,
    issueIdsRecent: sortIssuesByLatestActivity(
      operatorIssues.map((issue) => issue.id),
      dataset.allIssues,
    ).slice(0, 15),
    timeScaleGraphsIssueCount: buildIssueCountGraphs(operatorIssues),
    timeScaleGraphsUptimeRatios: [7, 30, days].map((window) =>
      buildOperatorUptimeGraph(
        operatorLines,
        operatorIssuesByLineId,
        dataset.publicHolidaySet,
        window,
      ),
    ),
    linePerformanceComparison,
    totalDowntimeDurationSeconds: totalDowntimeSeconds,
    downtimeDurationByIssueType: pickIssueDurationByType(operatorIssues),
    yearsOfOperation: Math.max(
      0,
      Math.floor(
        nowSg().diff(
          parseDateTime(operator.foundedAt),
          'years',
        ).years,
      ),
    ),
  };

  return {
    data: profile,
    included: withIssues(
      dataset.included,
      dataset.allIssues,
      profile.issueIdsRecent,
    ),
  };
}

export async function getSystemMapData() {
  const overview = await getOverviewData(30);
  return {
    overview: overview.data,
    included: overview.included,
  };
}

export async function getHistoryYearSummaryData(year: number) {
  const dataset = await buildBaseDataset();
  const yearStart = DateTime.fromObject(
    { year, month: 1, day: 1 },
    { zone: SG_TIMEZONE },
  ).startOf('day');
  const yearEnd = yearStart.plus({ years: 1 });
  const rangeEnd = yearEnd.minus({ days: 1 });
  const factRows = await getIssueDayFactsInRange(yearStart, rangeEnd);
  const lineFactRows = await getLineDayFactsInRange(yearStart, rangeEnd);
  if (
    factRows.length > 0 &&
    hasLineFactsCoverage(
      lineFactRows,
      yearStart,
      rangeEnd,
      Object.keys(dataset.included.lines),
    )
  ) {
    const issueIds = [...new Set(factRows.map((row) => row.issue_id))];
    const summaryByMonth = Array.from({ length: 12 }, (_, index) => {
      const monthStart = DateTime.fromObject(
        { year, month: index + 1, day: 1 },
        { zone: SG_TIMEZONE },
      ).startOf('day');
      const monthEnd = monthStart.plus({ months: 1 });
      const monthRows = factRows.filter((row) => {
        const date = DateTime.fromISO(row.date, { zone: SG_TIMEZONE });
        return date >= monthStart && date < monthEnd;
      });
      const uniqueIssues = new Map<string, IssueType>();
      for (const row of monthRows) {
        uniqueIssues.set(row.issue_id, row.issue_type as IssueType);
      }
      const issueCountsByType = [...uniqueIssues.values()].reduce<
        Partial<Record<IssueType, number>>
      >((acc, type) => {
        acc[type] = (acc[type] ?? 0) + 1;
        return acc;
      }, {});
      return {
        month: monthStart.toISODate()!,
        issueCountsByType,
        totalCount: uniqueIssues.size,
      };
    }).reverse();

    return {
      data: {
        startAt: yearStart.toISODate()!,
        endAt: yearEnd.minus({ day: 1 }).toISODate()!,
        summaryByMonth,
      },
      included: withIssues(dataset.included, dataset.allIssues, issueIds),
    };
  }

  const issues = Object.values(dataset.allIssues).filter((issue) =>
    issueOverlapsRange(issue, yearStart, yearEnd),
  );

  const summaryByMonth = Array.from({ length: 12 }, (_, index) => {
    const monthStart = DateTime.fromObject(
      { year, month: index + 1, day: 1 },
      { zone: SG_TIMEZONE },
    ).startOf('day');
    const monthEnd = monthStart.plus({ months: 1 });
    const monthIssues = issues.filter((issue) =>
      issueOverlapsRange(issue, monthStart, monthEnd),
    );
    return {
      month: monthStart.toISODate()!,
      issueCountsByType: pickIssueTypes(monthIssues),
      totalCount: monthIssues.length,
    };
  }).reverse();

  return {
    data: {
      startAt: yearStart.toISODate()!,
      endAt: yearEnd.minus({ day: 1 }).toISODate()!,
      summaryByMonth,
    },
    included: withIssues(
      dataset.included,
      dataset.allIssues,
      issues.map((issue) => issue.id),
    ),
  };
}

export async function getHistoryYearMonthData(year: number, month: number) {
  const dataset = await buildBaseDataset();
  const monthStart = DateTime.fromObject(
    { year, month, day: 1 },
    { zone: SG_TIMEZONE },
  ).startOf('day');
  const monthEnd = monthStart.plus({ months: 1 });
  const rangeEnd = monthEnd.minus({ days: 1 });
  const factRows = await getIssueDayFactsInRange(monthStart, rangeEnd);
  const lineFactRows = await getLineDayFactsInRange(monthStart, rangeEnd);
  if (
    factRows.length > 0 &&
    hasLineFactsCoverage(
      lineFactRows,
      monthStart,
      rangeEnd,
      Object.keys(dataset.included.lines),
    )
  ) {
    const issueIds = [...new Set(factRows.map((row) => row.issue_id))];
    const weeks = new Map<string, string[]>();
    for (
      let date = monthStart.startOf('week');
      date < monthEnd.endOf('week');
      date = date.plus({ week: 1 })
    ) {
      const weekStart = date.startOf('week');
      const weekEnd = weekStart.plus({ week: 1 });
      const key = `${date.weekYear}-W${date.weekNumber.toString().padStart(2, '0')}`;
      const weekIssueIds = [
        ...new Set(
          factRows
            .filter((row) => {
              const rowDate = DateTime.fromISO(row.date, { zone: SG_TIMEZONE });
              return rowDate >= weekStart && rowDate < weekEnd;
            })
            .map((row) => row.issue_id),
        ),
      ].sort((a, b) => b.localeCompare(a));
      if (weekIssueIds.length > 0 || !weeks.has(key)) {
        weeks.set(key, weekIssueIds);
      }
    }

    return {
      data: {
        startAt: monthStart.toISODate()!,
        endAt: monthEnd.minus({ day: 1 }).toISODate()!,
        issuesByWeek: [...weeks.entries()]
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([week, ids]) => ({
            week,
            issueIds: ids,
          })),
      },
      included: withIssues(dataset.included, dataset.allIssues, issueIds),
    };
  }

  const issues = Object.values(dataset.allIssues).filter((issue) =>
    issueOverlapsRange(issue, monthStart, monthEnd),
  );

  const weeks = new Map<string, string[]>();
  for (
    let date = monthStart.startOf('week');
    date < monthEnd.endOf('week');
    date = date.plus({ week: 1 })
  ) {
    const key = `${date.weekYear}-W${date.weekNumber.toString().padStart(2, '0')}`;
    const issueIds = issues
      .filter((issue) =>
        issueOverlapsRange(issue, date.startOf('week'), date.startOf('week').plus({ week: 1 })),
      )
      .map((issue) => issue.id)
      .sort((a, b) => b.localeCompare(a));
    if (issueIds.length > 0 || !weeks.has(key)) {
      weeks.set(key, issueIds);
    }
  }

  return {
    data: {
      startAt: monthStart.toISODate()!,
      endAt: monthEnd.minus({ day: 1 }).toISODate()!,
      issuesByWeek: [...weeks.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([week, issueIds]) => ({
          week,
          issueIds,
        })),
    },
    included: withIssues(
      dataset.included,
      dataset.allIssues,
      issues.map((issue) => issue.id),
    ),
  };
}

export async function getHistoryDayData(
  year: number,
  month: number,
  day: number,
) {
  const date = DateTime.fromObject({ year, month, day }, { zone: SG_TIMEZONE });
  const dataset = await buildBaseDataset();
  const factRows = await getIssueDayFactsInRange(date, date);
  const lineFactRows = await getLineDayFactsInRange(date, date);
  if (
    factRows.length > 0 &&
    hasLineFactsCoverage(
      lineFactRows,
      date,
      date,
      Object.keys(dataset.included.lines),
    )
  ) {
    const issueIds = [...new Set(factRows.map((row) => row.issue_id))].sort((a, b) =>
      b.localeCompare(a),
    );
    return {
      data: {
        startAt: date.toISODate()!,
        endAt: date.toISODate()!,
        issueIds,
      },
      included: withIssues(dataset.included, dataset.allIssues, issueIds),
    };
  }

  const issues = Object.values(dataset.allIssues).filter((issue) =>
    issueTouchesDate(issue, date),
  );
  const issueIds = issues.map((issue) => issue.id).sort((a, b) => b.localeCompare(a));

  return {
    data: {
      startAt: date.toISODate()!,
      endAt: date.toISODate()!,
      issueIds,
    },
    included: withIssues(dataset.included, dataset.allIssues, issueIds),
  };
}

export async function getStatisticsData() {
  const dataset = await buildBaseDataset();
  const issues = Object.values(dataset.allIssues);
  const rollingYearEnd = nowSg().startOf('day');
  const rollingYearStart = rollingYearEnd.minus({ days: 364 });
  const issueFactRows = await getIssueDayFactsInRange(rollingYearStart, rollingYearEnd);
  const lineFactRows = await getLineDayFactsInRange(rollingYearStart, rollingYearEnd);
  const hasRollingYearCoverage = hasLineFactsCoverage(
    lineFactRows,
    rollingYearStart,
    rollingYearEnd,
    Object.keys(dataset.included.lines),
  );
  const longestDisruptions = [...issues]
    .filter((issue) => issue.type === 'disruption')
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 10)
    .map((issue) => issue.id);

  const chartTotalIssueCountByLine: Chart = {
    title: 'Issue Count by Line',
    data: Object.values(dataset.included.lines).map((line) => {
      const lineIssues = issues.filter((issue) => issue.lineIds.includes(line.id));
      const counts = pickIssueTypes(lineIssues);
      return {
        name: line.id,
        payload: {
          disruption: counts.disruption ?? 0,
          maintenance: counts.maintenance ?? 0,
          infra: counts.infra ?? 0,
          totalIssues: lineIssues.length,
        },
      };
    }),
  };

  const stationIssueCounts = Object.values(dataset.included.stations).map(
    (station) => {
      const stationIssues = issues.filter((issue) =>
        issue.branchesAffected.some((branch) =>
          branch.stationIds.includes(station.id),
        ),
      );
      const counts = pickIssueTypes(stationIssues);
      return {
        name: station.id,
        payload: {
          disruption: counts.disruption ?? 0,
          maintenance: counts.maintenance ?? 0,
          infra: counts.infra ?? 0,
          totalIssues: stationIssues.length,
        },
      };
    },
  );

  const chartTotalIssueCountByStation: Chart = {
    title: 'Issue Count by Station',
    data: stationIssueCounts
      .sort(
        (a, b) =>
          (b.payload.totalIssues as number) - (a.payload.totalIssues as number),
      )
      .slice(0, 15),
  };

  const chartRollingYearHeatmap: Chart = {
    title: 'Rolling Year Heatmap',
    data: Array.from({ length: 365 }, (_, index) => {
      const date = rollingYearStart.plus({ days: index }).toISODate()!;
      const dayRows =
        hasRollingYearCoverage
          ? issueFactRows.filter((row) => row.date === date && row.active_anytime)
          : [];
      if (hasRollingYearCoverage) {
        return {
          name: date,
          payload: dayRows.reduce<Record<string, number>>(
            (acc, row) => {
              acc[row.issue_type] += 1;
              return acc;
            },
            { disruption: 0, maintenance: 0, infra: 0 },
          ),
        };
      }
      const dayDate = DateTime.fromISO(date, { zone: SG_TIMEZONE });
      const dayIssues = issues.filter((issue) => issueTouchesDate(issue, dayDate));
      const counts = pickIssueTypes(dayIssues);
      return {
        name: date,
        payload: {
          disruption: counts.disruption ?? 0,
          maintenance: counts.maintenance ?? 0,
          infra: counts.infra ?? 0,
        },
      };
    }),
  };

  const statistics: SystemAnalytics = {
    timeScaleChartsIssueCount: buildIssueCountGraphs(issues),
    timeScaleChartsIssueDuration:
      hasRollingYearCoverage
        ? buildCountChartsFromIssueFacts(issueFactRows, true)
        : buildIssueDurationGraphs(issues),
    chartTotalIssueCountByLine,
    chartTotalIssueCountByStation,
    chartRollingYearHeatmap,
    issueIdsDisruptionLongest: longestDisruptions,
  };

  return {
    data: statistics,
    included: withIssues(
      dataset.included,
      dataset.allIssues,
      longestDisruptions,
    ),
  };
}

export async function getSitemapData() {
  const dataset = await buildBaseDataset();
  const issues = Object.values(dataset.allIssues).filter(
    (issue) => issue.intervals[0] != null,
  );
  const firstDates = issues.map((issue) =>
    parseDateTime(issue.intervals[0].startAt),
  );
  const earliest = firstDates.sort((a, b) => a.toMillis() - b.toMillis())[0];
  const latest = firstDates.sort((a, b) => b.toMillis() - a.toMillis())[0];

  return {
    lineIds: Object.keys(dataset.included.lines).sort(),
    stationIds: Object.keys(dataset.included.stations).sort(),
    operatorIds: Object.keys(dataset.included.operators).sort(),
    issueIds: issues.map((issue) => issue.id),
    monthEarliest:
      earliest?.startOf('month').toISODate() ?? nowSg().toISODate()!,
    monthLatest: latest?.startOf('month').toISODate() ?? nowSg().toISODate()!,
  };
}
