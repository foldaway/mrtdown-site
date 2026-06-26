import {
  type Service as CoreService,
  type FacilityEffectKind,
  type IssueType,
  resolvePeriods,
  type ServiceEffectKind,
} from '@mrtdown/core';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { AppDb } from '~/db';
import {
  evidencesTable,
  impactEventCausesTable,
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventFacilityEffectsTable,
  impactEventPeriodsTable,
  impactEventServiceEffectsTable,
  impactEventServiceScopesTable,
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
  statisticsSnapshotsTable,
  townsTable,
} from '~/db/schema';
import type {
  ChartEntry,
  Granularity,
  IncludedEntities,
  Issue,
  IssueAffectedBranch,
  IssueInterval,
  Line,
  LineSummary,
  LineSummaryDayType,
  LineSummaryStatus,
  Station,
  TimeScaleChart,
} from '~/types';
import { getPublicCrowdReportSignals } from '~/util/crowdReports';
import {
  issueContributesToLineDowntime,
  issueContributesToLineStatus,
} from '~/util/issueOperationalEffects';
import {
  deriveLineStartedAtFromBranches,
  sortLineBranchesForCurrentView,
} from '~/util/lineBranches';
import {
  recordServerTiming,
  timeServerSpan,
  timeSyncServerSpan,
} from '~/util/serverTiming';
import {
  selectServiceRevisionForReferenceDate,
  serviceRevisionHasEnded,
} from '~/util/serviceRevisions';

const SG_TIMEZONE = 'Asia/Singapore';
const ISSUE_TYPES = [
  'disruption',
  'maintenance',
  'infra',
] as const satisfies readonly IssueType[];

type BaseIncludedEntities = Omit<IncludedEntities, 'issues'>;

type DatasetLineBranch = {
  id: CoreService['id'];
  name: CoreService['name'];
  startedAt: CoreService['revisions'][number]['startAt'] | null;
  endedAt: CoreService['revisions'][number]['endAt'];
  stationIds: Array<
    CoreService['revisions'][number]['path']['stations'][number]['stationId']
  >;
};

type OperatorOperationalStatus =
  | 'all_operational'
  | 'some_lines_disrupted'
  | 'some_lines_under_maintenance'
  | 'all_lines_closed_for_day';

type OperatorLinePerformance = {
  lineId: string;
  status: LineSummaryStatus;
  uptimeRatio: number | null;
  issueCount: number;
};

type IssueWithOperationalEffects = Issue & {
  serviceEffectKinds: ServiceEffectKind[];
  facilityEffectKinds: FacilityEffectKind[];
};

type BranchWithEntries = DatasetLineBranch & {
  entries: Array<{
    stationId: string;
    displayCode: string;
    pathIndex: number;
  }>;
};

type ImpactEventServiceScopeRow = Pick<
  typeof impactEventServiceScopesTable.$inferSelect,
  'type' | 'station_id' | 'from_station_id' | 'to_station_id'
>;

export function deriveServiceScopeStationIds(
  branchStationIds: readonly string[],
  scopeRows: readonly ImpactEventServiceScopeRow[],
) {
  if (scopeRows.length === 0) {
    return [...branchStationIds];
  }

  if (scopeRows.some((scope) => scope.type === 'service.whole')) {
    return [...branchStationIds];
  }

  const stationIds = new Set<string>();

  for (const scope of scopeRows) {
    switch (scope.type) {
      case 'service.point': {
        if (
          scope.station_id != null &&
          branchStationIds.includes(scope.station_id)
        ) {
          stationIds.add(scope.station_id);
        }
        break;
      }
      case 'service.segment': {
        if (scope.from_station_id == null || scope.to_station_id == null) {
          break;
        }

        const fromIndex = branchStationIds.indexOf(scope.from_station_id);
        const toIndex = branchStationIds.indexOf(scope.to_station_id);
        if (fromIndex === -1 || toIndex === -1) {
          break;
        }

        const startIndex = Math.min(fromIndex, toIndex);
        const endIndex = Math.max(fromIndex, toIndex);
        for (let index = startIndex; index <= endIndex; index++) {
          const stationId = branchStationIds[index];
          if (stationId != null) {
            stationIds.add(stationId);
          }
        }
        break;
      }
    }
  }

  const scopedStationIds = branchStationIds.filter((stationId) =>
    stationIds.has(stationId),
  );
  return scopedStationIds.length > 0 ? scopedStationIds : [...branchStationIds];
}

type ImpactEventStateRow = Pick<
  typeof impactEventsTable.$inferSelect,
  'id' | 'type'
>;

export function selectServiceBranchSourceEvents<T extends ImpactEventStateRow>(
  selectedStateEvents: readonly T[],
) {
  const serviceScopeEvents = selectedStateEvents.filter(
    (event) => event.type === 'service_scopes.set',
  );

  return serviceScopeEvents.length > 0
    ? serviceScopeEvents
    : selectedStateEvents;
}

type CommunitySignalOptions = {
  includeCommunitySignals?: boolean;
};

type BaseDataset = {
  included: BaseIncludedEntities;
  branchesByLineId: Record<string, BranchWithEntries[]>;
  branchByServiceId: Record<string, BranchWithEntries>;
  metadata: Record<string, string>;
  publicHolidaySet: Set<string>;
  allIssues: Record<string, IssueWithOperationalEffects>;
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>;
};

const BASE_DATASET_CACHE_TTL_MS = 5 * 60_000;
const D1_SELECT_IN_BATCH = 90;
const CROWD_REPORT_DUPLICATE_LOCK_METADATA_PREFIX =
  'crowd_report_duplicate_lock:';
const OPERATIONAL_FACTS_REBUILD_DAY_BATCH = 30;
const OPERATIONAL_FACTS_WRITE_BATCH = 10;
let cachedBaseDataset:
  | {
      expiresAt: number;
      value: BaseDataset;
    }
  | undefined;
let pendingBaseDataset: Promise<BaseDataset> | undefined;
const dateTimeCache = new Map<string, DateTime>();
const issueBoundsCache = new WeakMap<Issue, IssueIntervalBounds[]>();

type IssueIntervalBounds = {
  start: DateTime;
  end: DateTime | null;
};

type TimeScale = TimeScaleChart['dataTimeScale'];

export type SystemAnalytics = {
  timeScaleChartsIssueCount: TimeScaleChart[];
  timeScaleChartsIssueDuration: TimeScaleChart[];
  chartTotalIssueCountByLine: {
    title: string;
    data: ChartEntry[];
  };
  chartTotalIssueCountByStation: {
    title: string;
    data: ChartEntry[];
  };
  chartRollingYearHeatmap: {
    title: string;
    data: ChartEntry[];
  };
  issueIdsDisruptionLongest: string[];
};

type StatisticsSnapshotPayload = {
  kind: 'statistics_snapshot.v1';
  data: SystemAnalytics;
  included: IncludedEntities;
};

type StatisticsTimeWindow = {
  title: string;
  dataTimeScale: TimeScale;
  displayTimeScale?: TimeScale;
};

const STATISTICS_TIME_WINDOWS: StatisticsTimeWindow[] = [
  { title: '7d', dataTimeScale: makeTimeScale('day', 7) },
  {
    title: '1m',
    dataTimeScale: makeTimeScale('day', 30),
    displayTimeScale: makeTimeScale('month', 1),
  },
  {
    title: '1y',
    dataTimeScale: makeTimeScale('month', 12),
    displayTimeScale: makeTimeScale('year', 1),
  },
  { title: '10y', dataTimeScale: makeTimeScale('year', 10) },
  { title: '20y', dataTimeScale: makeTimeScale('year', 20) },
];

type IssueTypeCounts = Record<IssueType, number>;

type IssueTypeBreakdown = IssueTypeCounts & {
  totalIssues: number;
};

type IssueDayFactRow = {
  date: string;
  issue_id: string;
  issue_type: IssueType;
  active_anytime: boolean;
  duration_seconds: number;
};

type OperationalFactsRebuildContext = {
  issues: IssueWithOperationalEffects[];
  lines: Line[];
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>;
};

type OperationalFactRowsForDate = {
  date: string;
  issueRows: (typeof issueDayFactsTable.$inferInsert)[];
  lineRows: (typeof lineDayFactsTable.$inferInsert)[];
};

type OperationalFactCoverageStart =
  | {
      status: 'available';
      startDate: string | null;
    }
  | {
      status: 'missing_table';
    };

function nowSg() {
  return DateTime.now().setZone(SG_TIMEZONE);
}

async function getDefaultDb() {
  const { getDb } = await import('~/db');
  return getDb();
}

async function timeDbQuery<T>(name: string, query: () => Promise<T>) {
  return timeServerSpan(name, query);
}

function parseDateTime(value: string) {
  const cached = dateTimeCache.get(value);
  if (cached != null) {
    return cached;
  }

  let parsed: DateTime;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parsed = DateTime.fromISO(value, { zone: SG_TIMEZONE });
  } else {
    const iso = DateTime.fromISO(value, { setZone: true });
    if (iso.isValid) {
      parsed = iso.setZone(SG_TIMEZONE);
    } else {
      const sqlDateTime = DateTime.fromSQL(value, { setZone: true });
      parsed = sqlDateTime.isValid
        ? sqlDateTime.setZone(SG_TIMEZONE)
        : DateTime.fromJSDate(new Date(value)).setZone(SG_TIMEZONE);
    }
  }

  dateTimeCache.set(value, parsed);
  return parsed;
}

function isoDate(value: DateTime) {
  const date = value.toISODate();
  if (date == null) {
    throw new Error(`Invalid DateTime value: ${value.invalidReason ?? value}`);
  }
  return date;
}

function isoDateTime(value: DateTime) {
  const dateTime = value.toISO();
  if (dateTime == null) {
    throw new Error(`Invalid DateTime value: ${value.invalidReason ?? value}`);
  }
  return dateTime;
}

function parseTranslations(value: unknown): Line['name'] {
  const isNonEmptyTranslation = (
    translation: string | null | undefined,
  ): translation is string =>
    typeof translation === 'string' && translation.trim().length > 0;
  const rawTranslations =
    value != null && typeof value === 'object'
      ? (value as Record<string, string | null | undefined>)
      : {};
  const fallback =
    [rawTranslations['en-SG'], rawTranslations.en].find(
      isNonEmptyTranslation,
    ) ??
    Object.values(rawTranslations).find(isNonEmptyTranslation) ??
    '';
  return {
    'en-SG': fallback,
    'zh-Hans': rawTranslations['zh-Hans'] ?? null,
    ms: rawTranslations.ms ?? null,
    ta: rawTranslations.ta ?? null,
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

function clipIssueIntervalsToRange(
  issue: Issue,
  windowStart: DateTime,
  windowEnd: DateTime,
  referenceNow = nowSg(),
) {
  return getIssueBounds(issue)
    .map((interval) =>
      clipIntervalToRange(
        interval.start,
        interval.end,
        windowStart,
        windowEnd,
        referenceNow,
      ),
    )
    .filter((interval): interval is IssueIntervalBounds => interval != null);
}

function clipIntervalToRange(
  start: DateTime,
  end: DateTime | null,
  windowStart: DateTime,
  windowEnd: DateTime,
  referenceNow = nowSg(),
): IssueIntervalBounds | null {
  const boundedEnd = end ?? referenceNow;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = boundedEnd < windowEnd ? boundedEnd : windowEnd;
  if (overlapEnd <= overlapStart) {
    return null;
  }
  return { start: overlapStart, end: overlapEnd };
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
    const normalizedStartAt = isoDateTime(parseDateTime(row.start_at));
    const resolvedEndAtRaw = row.end_at_resolved ?? row.end_at ?? null;
    const normalizedEndAt =
      resolvedEndAtRaw != null
        ? isoDateTime(parseDateTime(resolvedEndAtRaw))
        : null;
    const key = `${normalizedStartAt}::${normalizedEndAt ?? 'null'}`;
    if (unique.has(key)) {
      continue;
    }

    unique.set(key, {
      startAt: normalizedStartAt,
      endAt: normalizedEndAt,
      status: classifyInterval(
        normalizedStartAt,
        normalizedEndAt,
        referenceNow,
      ),
    });
  }

  return [...unique.values()].sort((a, b) => {
    return (
      parseDateTime(a.startAt).toMillis() - parseDateTime(b.startAt).toMillis()
    );
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
      startAt: isoDateTime(parseDateTime(row.start_at)),
      endAt: row.end_at != null ? isoDateTime(parseDateTime(row.end_at)) : null,
    })),
    asOf: isoDateTime(asOf),
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
  if (publicHolidaySet.has(isoDate(date))) {
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

function serviceWindowContains(
  serviceWindow: ReturnType<typeof serviceWindowForDate>,
  date: DateTime,
) {
  return date >= serviceWindow.start && date <= serviceWindow.end;
}

function serviceWindowIsAfterLineStart(
  line: Line,
  serviceWindow: ReturnType<typeof serviceWindowForDate>,
) {
  if (line.startedAt == null) {
    return true;
  }

  return serviceWindow.start.startOf('day') >= parseDateTime(line.startedAt);
}

function serviceWindowAfterLineStart(
  line: Line,
  serviceWindow: ReturnType<typeof serviceWindowForDate>,
) {
  const windowStart =
    line.startedAt == null
      ? serviceWindow.start
      : DateTime.max(serviceWindow.start, parseDateTime(line.startedAt));
  const seconds = Math.max(
    0,
    serviceWindow.end.diff(windowStart, 'seconds').seconds,
  );
  return {
    start: windowStart,
    end: serviceWindow.end,
    seconds,
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
  if (serviceWindowContains(window, referenceNow)) {
    return true;
  }

  const previousWindow = serviceWindowForDate(
    line,
    referenceNow.minus({ day: 1 }),
    publicHolidaySet,
  );
  return (
    serviceWindowIsAfterLineStart(line, previousWindow) &&
    serviceWindowContains(previousWindow, referenceNow)
  );
}

function pickIssueTypes<T extends { type: IssueType }>(items: T[]) {
  const counts: Partial<Record<IssueType, number>> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

function emptyIssueTypePayload(): Record<IssueType, number> {
  return { disruption: 0, maintenance: 0, infra: 0 };
}

function groupIssueFactRowsByDate<T extends { date: string }>(rows: T[]) {
  const rowsByDate = new Map<string, T[]>();
  for (const row of rows) {
    const dayRows = rowsByDate.get(row.date);
    if (dayRows == null) {
      rowsByDate.set(row.date, [row]);
      continue;
    }
    dayRows.push(row);
  }
  return rowsByDate;
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

function createIssueTypeCounts(): IssueTypeCounts {
  return {
    disruption: 0,
    maintenance: 0,
    infra: 0,
  };
}

function createIssueTypeIntervalGroups(): Record<
  IssueType,
  IssueIntervalBounds[]
> {
  return {
    disruption: [],
    maintenance: [],
    infra: [],
  };
}

function sumIssueTypeIntervalGroups(
  intervalGroups: Record<IssueType, IssueIntervalBounds[]>,
  referenceNow = nowSg(),
) {
  const counts = createIssueTypeCounts();
  for (const issueType of ISSUE_TYPES) {
    counts[issueType] = sumIntervalSeconds(
      intervalGroups[issueType],
      referenceNow,
    );
  }
  return counts;
}

function createIssueTypeBreakdown(): IssueTypeBreakdown {
  return {
    ...createIssueTypeCounts(),
    totalIssues: 0,
  };
}

function addIssueTypeCount(
  counts: IssueTypeCounts,
  issueType: IssueType,
  amount: number,
) {
  counts[issueType] += amount;
}

function groupIssueFactCountsByDate(
  rows: IssueDayFactRow[],
  durationMode = false,
) {
  const countsByDate = new Map<string, IssueTypeCounts>();

  for (const row of rows) {
    const amount = durationMode
      ? row.duration_seconds
      : row.active_anytime
        ? 1
        : 0;
    if (amount === 0) {
      continue;
    }

    let counts = countsByDate.get(row.date);
    if (counts == null) {
      counts = createIssueTypeCounts();
      countsByDate.set(row.date, counts);
    }

    addIssueTypeCount(counts, row.issue_type, amount);
  }

  return countsByDate;
}

function getIssueBounds(issue: Issue): IssueIntervalBounds[] {
  const cached = issueBoundsCache.get(issue);
  if (cached != null) {
    return cached;
  }

  const bounds = mergeIntervals(
    issue.intervals.map((interval) => ({
      start: parseDateTime(interval.startAt),
      end: interval.endAt != null ? parseDateTime(interval.endAt) : null,
    })),
  );
  issueBoundsCache.set(issue, bounds);
  return bounds;
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
    return (
      overlapSeconds(interval.start, interval.end, rangeStart, rangeEnd) > 0
    );
  });
}

function issueActiveNow(issue: Issue, referenceNow = nowSg()) {
  return getIssueBounds(issue).some((interval) => {
    return (
      interval.start <= referenceNow &&
      (interval.end == null || interval.end > referenceNow)
    );
  });
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

async function buildDataset(
  referenceNow = nowSg(),
  db?: AppDb,
  issueIds?: readonly string[],
): Promise<BaseDataset> {
  const database =
    db ?? (await timeServerSpan('db_connect', () => getDefaultDb()));
  const selectedIssueIds =
    issueIds == null ? undefined : [...new Set(issueIds)];

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
    publicHolidayRows,
    issueRows,
    latestEvidenceRows,
    impactEventRows,
  ] = await timeServerSpan('dataset_base_queries', () =>
    Promise.all([
      timeDbQuery('dataset_q_metadata', () =>
        database.select().from(metadataTable).where(publicMetadataKeySql()),
      ),
      timeDbQuery('dataset_q_lines', () => database.select().from(linesTable)),
      timeDbQuery('dataset_q_line_operators', () =>
        database.select().from(lineOperatorsTable),
      ),
      timeDbQuery('dataset_q_operators', () =>
        database.select().from(operatorsTable),
      ),
      timeDbQuery('dataset_q_towns', () => database.select().from(townsTable)),
      timeDbQuery('dataset_q_landmarks', () =>
        database.select().from(landmarksTable),
      ),
      timeDbQuery('dataset_q_stations', () =>
        database
          .select({
            id: stationsTable.id,
            name: stationsTable.name,
            townId: stationsTable.townId,
            latitude: stationsTable.latitude,
            longitude: stationsTable.longitude,
          })
          .from(stationsTable),
      ),
      timeDbQuery('dataset_q_station_codes', () =>
        database.select().from(stationCodesTable),
      ),
      timeDbQuery('dataset_q_station_landmarks', () =>
        database.select().from(stationLandmarksTable),
      ),
      timeDbQuery('dataset_q_services', () =>
        database.select().from(servicesTable),
      ),
      timeDbQuery('dataset_q_service_revisions', () =>
        database.select().from(serviceRevisionsTable),
      ),
      timeDbQuery('dataset_q_public_holidays', () =>
        database.select().from(publicHolidaysTable),
      ),
      selectedIssueIds == null
        ? timeDbQuery('dataset_q_issues', () =>
            database.select().from(issuesTable),
          )
        : timeDbQuery('dataset_q_issues', () =>
            selectByIdChunks(selectedIssueIds, (ids) =>
              database
                .select()
                .from(issuesTable)
                .where(inArray(issuesTable.id, ids)),
            ),
          ),
      selectedIssueIds == null
        ? timeDbQuery('dataset_q_latest_evidence', () =>
            database
              .select({
                issue_id: evidencesTable.issue_id,
                latest_ts: sql<string>`max(${evidencesTable.ts})`,
              })
              .from(evidencesTable)
              .groupBy(evidencesTable.issue_id),
          )
        : timeDbQuery('dataset_q_latest_evidence', () =>
            selectByIdChunks(selectedIssueIds, (ids) =>
              database
                .select({
                  issue_id: evidencesTable.issue_id,
                  latest_ts: sql<string>`max(${evidencesTable.ts})`,
                })
                .from(evidencesTable)
                .where(inArray(evidencesTable.issue_id, ids))
                .groupBy(evidencesTable.issue_id),
            ),
          ),
      selectedIssueIds == null
        ? timeDbQuery('dataset_q_impact_events', () =>
            database.select().from(impactEventsTable),
          )
        : timeDbQuery('dataset_q_impact_events', () =>
            selectByIdChunks(selectedIssueIds, (ids) =>
              database
                .select()
                .from(impactEventsTable)
                .where(inArray(impactEventsTable.issue_id, ids)),
            ),
          ),
    ]),
  );

  const latestEventByTypeByIssueId = impactEventRows.reduce<
    Record<
      string,
      Partial<
        Record<
          (typeof impactEventRows)[number]['type'],
          (typeof impactEventRows)[number]
        >
      >
    >
  >((acc, event) => {
    acc[event.issue_id] ??= {};
    const current = acc[event.issue_id][event.type];
    if (current == null) {
      acc[event.issue_id][event.type] = event;
      return acc;
    }

    const tsDiff =
      parseDateTime(event.ts).toMillis() - parseDateTime(current.ts).toMillis();
    if (tsDiff > 0 || (tsDiff === 0 && event.id > current.id)) {
      acc[event.issue_id][event.type] = event;
    }
    return acc;
  }, {});

  const selectedStateEventIds = [
    ...new Set(
      Object.values(latestEventByTypeByIssueId).flatMap((latestEventByType) =>
        [
          latestEventByType['periods.set'],
          latestEventByType['causes.set'],
          latestEventByType['service_scopes.set'],
          latestEventByType['service_effects.set'],
          latestEventByType['facility_effects.set'],
        ]
          .filter(
            (event): event is (typeof impactEventRows)[number] => event != null,
          )
          .map((event) => event.id),
      ),
    ),
  ];
  const periodImpactEventIds = [
    ...new Set(
      Object.values(latestEventByTypeByIssueId)
        .map((latestEventByType) => latestEventByType['periods.set']?.id)
        .filter((eventId): eventId is string => eventId != null),
    ),
  ];
  const [
    impactEventPeriodRows,
    impactEventServiceRows,
    impactEventFacilityRows,
    impactEventCauseRows,
    impactEventServiceScopeRows,
    impactEventServiceEffectRows,
    impactEventFacilityEffectRows,
  ] = await timeServerSpan('dataset_issue_detail_queries', () =>
    Promise.all([
      timeDbQuery('dataset_q_impact_event_periods', () =>
        selectByIdChunks(periodImpactEventIds, (ids) =>
          database
            .select()
            .from(impactEventPeriodsTable)
            .where(inArray(impactEventPeriodsTable.impact_event_id, ids)),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_services', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventEntityServicesTable)
            .where(
              inArray(impactEventEntityServicesTable.impact_event_id, ids),
            ),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_facilities', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventEntityFacilitiesTable)
            .where(
              inArray(impactEventEntityFacilitiesTable.impact_event_id, ids),
            ),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_causes', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventCausesTable)
            .where(inArray(impactEventCausesTable.impact_event_id, ids)),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_service_scopes', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventServiceScopesTable)
            .where(inArray(impactEventServiceScopesTable.impact_event_id, ids)),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_service_effects', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventServiceEffectsTable)
            .where(
              inArray(impactEventServiceEffectsTable.impact_event_id, ids),
            ),
        ),
      ),
      timeDbQuery('dataset_q_impact_event_facility_effects', () =>
        selectByIdChunks(selectedStateEventIds, (ids) =>
          database
            .select()
            .from(impactEventFacilityEffectsTable)
            .where(
              inArray(impactEventFacilityEffectsTable.impact_event_id, ids),
            ),
        ),
      ),
    ]),
  );

  const metadata = Object.fromEntries(
    metadataRows.map((row) => [row.key, row.value]),
  );
  const publicHolidaySet = new Set(publicHolidayRows.map((row) => row.date));
  const referenceDate = isoDate(referenceNow);

  const operatorsById = Object.fromEntries(
    operatorsRows.map((row) => {
      const name = parseTranslations(row.name);
      const operator: IncludedEntities['operators'][string] = {
        id: row.id,
        name,
        foundedAt: row.founded_at,
        url: row.url,
      };
      return [row.id, operator];
    }),
  );

  const townsById = Object.fromEntries(
    townsRows.map((row) => {
      const name = parseTranslations(row.name);
      return [
        row.id,
        {
          id: row.id,
          name,
        },
      ];
    }),
  ) as IncludedEntities['towns'];

  const landmarksById = Object.fromEntries(
    landmarksRows.map((row) => {
      const name = parseTranslations(row.name);
      return [
        row.id,
        {
          id: row.id,
          name,
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
      const name = parseTranslations(row.name);
      const line: Line = {
        id: row.id,
        name,
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

  const revisionForReferenceDateByServiceId = Object.fromEntries(
    Object.entries(revisionsByServiceId)
      .map(([serviceId, revisions]) => {
        const revision = selectServiceRevisionForReferenceDate(
          revisions,
          referenceDate,
        );
        return revision == null ? null : ([serviceId, revision] as const);
      })
      .filter(
        (
          entry,
        ): entry is readonly [string, (typeof serviceRevisionRows)[number]] =>
          entry != null,
      ),
  );

  const allRevisionIds = [
    ...new Set(serviceRevisionRows.map((revision) => revision.id)),
  ];
  const servicePathRows = await timeServerSpan(
    'dataset_service_path_query',
    () =>
      selectByIdChunks(allRevisionIds, (ids) =>
        database
          .select()
          .from(serviceRevisionPathStationEntriesTable)
          .where(
            inArray(
              serviceRevisionPathStationEntriesTable.service_revision_id,
              ids,
            ),
          ),
      ),
  );
  const assemblyStartedAt = performance.now();

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

  const latestRevisionByServiceId = Object.fromEntries(
    serviceRows
      .map((service) => {
        const revisions = revisionsByServiceId[service.id] ?? [];
        const revisionsWithPath = revisions.filter((revision) => {
          const revisionKey = `${revision.id}::${service.id}`;
          const entries = pathEntriesByRevisionKey[revisionKey] ?? [];
          return entries.length > 0;
        });
        const revisionForReferenceDate = selectServiceRevisionForReferenceDate(
          revisionsWithPath,
          referenceDate,
        );
        if (revisionForReferenceDate == null) {
          return null;
        }

        return [service.id, revisionForReferenceDate] as const;
      })
      .filter(
        (
          entry,
        ): entry is readonly [string, (typeof serviceRevisionRows)[number]] =>
          entry != null,
      ),
  );

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
    const latestRevision = latestRevisionByServiceId[service.id];
    if (latestRevision == null) continue;

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

    const name = parseTranslations(service.name);
    const revisionStartDate =
      latestRevision.start_at != null
        ? parseDateTime(latestRevision.start_at)
        : null;
    const minStart = startedDates.sort(
      (a, b) => a.toMillis() - b.toMillis(),
    )[0];
    const effectiveStart = revisionStartDate ?? minStart ?? null;
    const branch: BranchWithEntries = {
      id: service.id,
      name,
      startedAt:
        effectiveStart != null && effectiveStart <= referenceNow
          ? effectiveStart.toISODate()
          : null,
      endedAt: (() => {
        const endedAtByStationCode =
          endedDates.length === entries.length
            ? (endedDates
                .sort((a, b) => b.toMillis() - a.toMillis())[0]
                ?.toISODate() ?? null)
            : null;
        if (
          endedAtByStationCode != null &&
          endedAtByStationCode < referenceDate
        ) {
          return endedAtByStationCode;
        }
        if (serviceRevisionHasEnded(latestRevision, referenceDate)) {
          return latestRevision.end_at;
        }

        const overallRevision = revisionForReferenceDateByServiceId[service.id];
        if (
          overallRevision != null &&
          overallRevision.id !== latestRevision.id &&
          serviceRevisionHasEnded(overallRevision, referenceDate)
        ) {
          return overallRevision.end_at;
        }

        return null;
      })(),
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
    const sortedBranches = sortLineBranchesForCurrentView(branches);
    branchesByLineId[lineId] = sortedBranches;
    const line = linesById[lineId];
    if (line != null) {
      line.startedAt = deriveLineStartedAtFromBranches(
        line.startedAt,
        sortedBranches,
      );
    }

    for (const branch of sortedBranches) {
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
          endedAt:
            codeInfo?.ended_at != null && codeInfo.ended_at < referenceDate
              ? codeInfo.ended_at
              : undefined,
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
      endedAt:
        code.ended_at != null && code.ended_at < referenceDate
          ? code.ended_at
          : undefined,
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
      const name = parseTranslations(row.name);
      const station: Station = {
        id: row.id,
        name,
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

  const serviceScopesByImpactEventId = impactEventServiceScopeRows.reduce<
    Record<string, typeof impactEventServiceScopeRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const serviceEffectsByImpactEventId = impactEventServiceEffectRows.reduce<
    Record<string, typeof impactEventServiceEffectRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const facilityEffectsByImpactEventId = impactEventFacilityEffectRows.reduce<
    Record<string, typeof impactEventFacilityEffectRows>
  >((acc, row) => {
    if (acc[row.impact_event_id] == null) {
      acc[row.impact_event_id] = [];
    }
    acc[row.impact_event_id].push(row);
    return acc;
  }, {});

  const latestEvidenceAtByIssueId = Object.fromEntries(
    latestEvidenceRows.map((row) => [
      row.issue_id,
      row.latest_ts != null ? parseDateTime(row.latest_ts) : null,
    ]),
  ) as Record<string, DateTime | null>;

  const allIssues: Record<string, IssueWithOperationalEffects> = {};
  for (const row of issueRows) {
    const title = parseTranslations(row.title);
    const latestEventByType = latestEventByTypeByIssueId[row.id] ?? {};
    const selectedStateEvents = [
      latestEventByType['periods.set'],
      latestEventByType['causes.set'],
      latestEventByType['service_scopes.set'],
      latestEventByType['service_effects.set'],
      latestEventByType['facility_effects.set'],
    ].filter(
      (event): event is (typeof impactEventRows)[number] => event != null,
    );
    const serviceBranches = new Map<string, IssueAffectedBranch>();
    const facilityBranches = new Map<string, IssueAffectedBranch>();
    const causeSet = new Set<Issue['subtypes'][number]>();
    const serviceScopeRowsByServiceId = new Map<
      string,
      typeof impactEventServiceScopeRows
    >();

    const periodEvents =
      latestEventByType['periods.set'] != null
        ? [latestEventByType['periods.set']]
        : [];
    const canonicalPeriods = periodEvents.flatMap((event) => {
      return periodsByImpactEventId[event.id] ?? [];
    });

    const serviceScopeEvent = latestEventByType['service_scopes.set'];
    if (serviceScopeEvent != null) {
      const scopeRows =
        serviceScopesByImpactEventId[serviceScopeEvent.id] ?? [];
      for (const serviceRef of serviceRowsByImpactEventId[
        serviceScopeEvent.id
      ] ?? []) {
        serviceScopeRowsByServiceId.set(serviceRef.service_id, scopeRows);
      }
    }

    for (const event of selectedStateEvents) {
      for (const cause of causesByImpactEventId[event.id] ?? []) {
        causeSet.add(cause.type as Issue['subtypes'][number]);
      }

      for (const facilityRef of facilityRowsByImpactEventId[event.id] ?? []) {
        const station = stationsById[facilityRef.station_id];
        if (station == null) {
          continue;
        }

        const stationMemberships =
          facilityRef.line_id != null
            ? station.memberships.filter(
                (membership) => membership.lineId === facilityRef.line_id,
              )
            : station.memberships;

        if (
          stationMemberships.length === 0 &&
          facilityRef.line_id != null &&
          linesById[facilityRef.line_id] != null
        ) {
          const key = `${facilityRef.line_id}::${station.id}`;
          if (!facilityBranches.has(key)) {
            facilityBranches.set(key, {
              lineId: facilityRef.line_id,
              branchId: `${facilityRef.line_id}:${station.id}`,
              stationIds: [station.id],
            });
          }
        }

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

    for (const event of selectServiceBranchSourceEvents(selectedStateEvents)) {
      for (const serviceRef of serviceRowsByImpactEventId[event.id] ?? []) {
        const branch = branchByServiceId[serviceRef.service_id];
        const service = serviceById[serviceRef.service_id];
        if (branch == null || service == null) {
          continue;
        }
        serviceBranches.set(branch.id, {
          lineId: service.line_id,
          branchId: branch.id,
          stationIds: deriveServiceScopeStationIds(
            branch.stationIds,
            serviceScopeRowsByServiceId.get(serviceRef.service_id) ?? [],
          ),
        });
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

    const serviceEffectKinds =
      latestEventByType['service_effects.set'] != null
        ? (
            serviceEffectsByImpactEventId[
              latestEventByType['service_effects.set'].id
            ] ?? []
          ).map((row) => row.kind)
        : [];

    const facilityEffectKinds =
      latestEventByType['facility_effects.set'] != null
        ? (
            facilityEffectsByImpactEventId[
              latestEventByType['facility_effects.set'].id
            ] ?? []
          ).map((row) => row.kind)
        : [];

    allIssues[row.id] = {
      id: row.id,
      title,
      type: row.type,
      subtypes: [...causeSet],
      durationSeconds,
      lineIds,
      branchesAffected,
      intervals,
      serviceEffectKinds,
      facilityEffectKinds,
    };
  }

  const issuesByLineId = buildIssuesByLineId(Object.values(allIssues));
  recordServerTiming('dataset_assembly', performance.now() - assemblyStartedAt);

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
    issuesByLineId,
  };
}

async function buildBaseDataset(
  referenceNow = nowSg(),
  db?: AppDb,
): Promise<BaseDataset> {
  return timeServerSpan('build_dataset', () => buildDataset(referenceNow, db));
}

async function getBaseDataset() {
  const now = Date.now();
  if (cachedBaseDataset != null && cachedBaseDataset.expiresAt > now) {
    recordServerTiming('base_dataset', 0, 'cache=hit');
    return cachedBaseDataset.value;
  }

  const startedAt = performance.now();
  const cacheState = pendingBaseDataset == null ? 'miss' : 'pending';
  pendingBaseDataset ??= buildBaseDataset()
    .then((dataset) => {
      cachedBaseDataset = {
        expiresAt: Date.now() + BASE_DATASET_CACHE_TTL_MS,
        value: dataset,
      };
      return dataset;
    })
    .finally(() => {
      pendingBaseDataset = undefined;
    });

  try {
    return await pendingBaseDataset;
  } finally {
    recordServerTiming(
      'base_dataset',
      performance.now() - startedAt,
      `cache=${cacheState}`,
    );
  }
}

async function getIncludedForIssueIds(issueIds: readonly string[]) {
  const dataset = await buildDataset(nowSg(), undefined, issueIds);
  return selectIncludedEntities(dataset.included, dataset.allIssues, {
    issueIds,
    includeStationMembershipLines: true,
  });
}

type IncludedEntitySelection = {
  issueIds?: readonly string[];
  lineIds?: readonly string[];
  operatorIds?: readonly string[];
  stationIds?: readonly string[];
  townIds?: readonly string[];
  landmarkIds?: readonly string[];
  includeIssueEntities?: boolean;
  includeLineOperators?: boolean;
  includeStationDetailEntities?: boolean;
  includeStationMembershipLines?: boolean;
};

function selectIssues(
  allIssues: Record<string, IssueWithOperationalEffects>,
  issueIds?: readonly string[],
) {
  return issueIds == null
    ? allIssues
    : Object.fromEntries(
        issueIds
          .filter((issueId) => allIssues[issueId] != null)
          .map((issueId) => [issueId, allIssues[issueId]]),
      );
}

function stripOperationalEffects(
  issues: Record<string, IssueWithOperationalEffects>,
): Record<string, Issue> {
  return Object.fromEntries(
    Object.entries(issues).map(([issueId, issue]) => {
      const {
        serviceEffectKinds: _serviceEffectKinds,
        facilityEffectKinds: _facilityEffectKinds,
        ...publicIssue
      } = issue;
      return [issueId, publicIssue];
    }),
  ) as Record<string, Issue>;
}

export function selectIncludedEntities(
  baseIncluded: BaseIncludedEntities,
  allIssues: Record<string, IssueWithOperationalEffects>,
  selection: IncludedEntitySelection,
): IncludedEntities {
  const selectedIssuesWithEffects = selectIssues(allIssues, selection.issueIds);
  const lineIds = new Set(selection.lineIds ?? []);
  const operatorIds = new Set(selection.operatorIds ?? []);
  const stationIds = new Set(selection.stationIds ?? []);
  const townIds = new Set(selection.townIds ?? []);
  const landmarkIds = new Set(selection.landmarkIds ?? []);

  if (selection.includeIssueEntities !== false) {
    for (const issue of Object.values(selectedIssuesWithEffects)) {
      for (const lineId of issue.lineIds) {
        lineIds.add(lineId);
      }
      for (const branch of issue.branchesAffected) {
        lineIds.add(branch.lineId);
        for (const stationId of branch.stationIds) {
          stationIds.add(stationId);
        }
      }
    }
  }

  if (selection.includeStationMembershipLines === true) {
    for (const stationId of stationIds) {
      const station = baseIncluded.stations[stationId];
      for (const membership of station?.memberships ?? []) {
        lineIds.add(membership.lineId);
      }
    }
  }

  if (selection.includeLineOperators === true) {
    for (const lineId of lineIds) {
      const line = baseIncluded.lines[lineId];
      for (const operator of line?.operators ?? []) {
        operatorIds.add(operator.operatorId);
      }
    }
  }

  if (selection.includeStationDetailEntities === true) {
    for (const stationId of stationIds) {
      const station = baseIncluded.stations[stationId];
      if (station == null) {
        continue;
      }
      townIds.add(station.townId);
      for (const landmarkId of station.landmarkIds) {
        landmarkIds.add(landmarkId);
      }
    }
  }

  return {
    lines: Object.fromEntries(
      [...lineIds]
        .filter((lineId) => baseIncluded.lines[lineId] != null)
        .map((lineId) => [lineId, baseIncluded.lines[lineId]]),
    ),
    stations: Object.fromEntries(
      [...stationIds]
        .filter((stationId) => baseIncluded.stations[stationId] != null)
        .map((stationId) => [stationId, baseIncluded.stations[stationId]]),
    ),
    issues: stripOperationalEffects(selectedIssuesWithEffects),
    landmarks: Object.fromEntries(
      [...landmarkIds]
        .filter((landmarkId) => baseIncluded.landmarks[landmarkId] != null)
        .map((landmarkId) => [landmarkId, baseIncluded.landmarks[landmarkId]]),
    ),
    towns: Object.fromEntries(
      [...townIds]
        .filter((townId) => baseIncluded.towns[townId] != null)
        .map((townId) => [townId, baseIncluded.towns[townId]]),
    ),
    operators: Object.fromEntries(
      [...operatorIds]
        .filter((operatorId) => baseIncluded.operators[operatorId] != null)
        .map((operatorId) => [operatorId, baseIncluded.operators[operatorId]]),
    ),
  };
}

export function buildLineSummary(
  line: Line,
  issues: IssueWithOperationalEffects[],
  days: number,
  publicHolidaySet: Set<string>,
  referenceNow = nowSg(),
): LineSummary {
  const startDate = referenceNow.startOf('day').minus({ days: days - 1 });
  const breakdownByDates: LineSummary['breakdownByDates'] = {};
  const downtimeIntervalsByIssueType = createIssueTypeIntervalGroups();

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
    const dailyIntervalsByIssueType = createIssueTypeIntervalGroups();

    for (const issue of issues) {
      const contributingBounds = clipIssueIntervalsToRange(
        issue,
        dayWindow.start,
        dayWindow.end,
        referenceNow,
      );
      const dayOverlap = sumIntervalSeconds(contributingBounds, referenceNow);

      if (dayOverlap <= 0) {
        continue;
      }

      dailyIntervalsByIssueType[issue.type].push(...contributingBounds);

      if (issueContributesToLineDowntime(issue)) {
        dailyDowntimeIntervals.push(...contributingBounds);
        downtimeIntervalsByIssueType[issue.type].push(...contributingBounds);
      }

      const current = dayBreakdown.breakdownByIssueTypes[issue.type] ?? {
        totalDurationSeconds: 0,
        issueIds: [],
      };
      if (!current.issueIds.includes(issue.id)) {
        current.issueIds.push(issue.id);
      }
      dayBreakdown.breakdownByIssueTypes[issue.type] = current;
    }

    const dailyDurationSecondsByIssueType = sumIssueTypeIntervalGroups(
      dailyIntervalsByIssueType,
      referenceNow,
    );
    for (const issueType of ISSUE_TYPES) {
      const current = dayBreakdown.breakdownByIssueTypes[issueType];
      if (current != null) {
        current.totalDurationSeconds =
          dailyDurationSecondsByIssueType[issueType];
      }
    }

    totalDowntimeSeconds += sumIntervalSeconds(
      dailyDowntimeIntervals,
      referenceNow,
    );

    breakdownByDates[isoDate(date)] = dayBreakdown;
  }

  const activeNow = issues.filter((issue) =>
    issueActiveNow(issue, referenceNow),
  );
  let status: LineSummaryStatus = 'normal';
  if (isLineFuture(line, referenceNow)) {
    status = 'future_service';
  } else if (!isLineOperatingNow(line, publicHolidaySet, referenceNow)) {
    status = 'closed_for_day';
  } else if (
    activeNow.some(
      (issue) =>
        issue.type === 'disruption' && issueContributesToLineStatus(issue),
    )
  ) {
    status = 'ongoing_disruption';
  } else if (
    activeNow.some(
      (issue) =>
        issue.type === 'maintenance' && issueContributesToLineStatus(issue),
    )
  ) {
    status = 'ongoing_maintenance';
  } else if (
    activeNow.some(
      (issue) => issue.type === 'infra' && issueContributesToLineStatus(issue),
    )
  ) {
    status = 'ongoing_infra';
  }

  const durationSecondsByIssueType = sumIssueTypeIntervalGroups(
    downtimeIntervalsByIssueType,
    referenceNow,
  );

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
    const payload = emptyIssueTypePayload();

    if (!durationMode) {
      for (const issue of issues) {
        const firstStart = issue.intervals[0]?.startAt;
        if (firstStart == null) {
          continue;
        }

        const firstStartAt = parseDateTime(firstStart);
        if (firstStartAt >= bucketStart && firstStartAt < bucketEnd) {
          payload[issue.type] += 1;
        }
      }
    } else {
      const intervalsByType: Record<IssueType, IssueIntervalBounds[]> = {
        disruption: [],
        maintenance: [],
        infra: [],
      };

      for (const issue of issues) {
        for (const interval of getIssueBounds(issue)) {
          const clipped = clipIntervalToRange(
            interval.start,
            interval.end,
            bucketStart,
            bucketEnd,
          );
          if (clipped != null) {
            intervalsByType[issue.type].push(clipped);
          }
        }
      }

      payload.disruption = sumIntervalSeconds(intervalsByType.disruption);
      payload.maintenance = sumIntervalSeconds(intervalsByType.maintenance);
      payload.infra = sumIntervalSeconds(intervalsByType.infra);
    }

    entries.push({
      name: isoDate(bucketStart),
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
  issues: IssueWithOperationalEffects[],
  publicHolidaySet: Set<string>,
  count: number,
): TimeScaleChart {
  const end = nowSg().startOf('day');
  const start = end.minus({ days: count - 1 });
  const data: ChartEntry[] = [];

  for (let offset = 0; offset < count; offset++) {
    const date = start.plus({ days: offset });
    const serviceWindow = serviceWindowAfterLineStart(
      line,
      serviceWindowForDate(line, date, publicHolidaySet),
    );
    const downtimeIntervals: IssueIntervalBounds[] = [];
    const downtimeIntervalsByIssueType = createIssueTypeIntervalGroups();

    if (serviceWindow.seconds > 0) {
      for (const issue of issues) {
        if (!issueContributesToLineDowntime(issue)) {
          continue;
        }

        const intervals = clipIssueIntervalsToRange(
          issue,
          serviceWindow.start,
          serviceWindow.end,
        );
        if (intervals.length === 0) {
          continue;
        }

        downtimeIntervals.push(...intervals);
        downtimeIntervalsByIssueType[issue.type].push(...intervals);
      }
    }

    const totalDowntime = sumIntervalSeconds(downtimeIntervals);
    const downtimeSecondsByIssueType = sumIssueTypeIntervalGroups(
      downtimeIntervalsByIssueType,
    );
    data.push({
      name: isoDate(date),
      payload: {
        uptimeRatio:
          serviceWindow.seconds > 0
            ? Math.max(0, 1 - totalDowntime / serviceWindow.seconds)
            : 1,
        'breakdown.disruption': downtimeSecondsByIssueType.disruption,
        'breakdown.maintenance': downtimeSecondsByIssueType.maintenance,
        'breakdown.infra': downtimeSecondsByIssueType.infra,
      },
    });
  }

  const buildAggregate = (windowStart: DateTime, windowCount: number) => {
    let serviceSeconds = 0;
    const downtimeIntervals: IssueIntervalBounds[] = [];
    for (let offset = 0; offset < windowCount; offset++) {
      const date = windowStart.plus({ days: offset });
      const serviceWindow = serviceWindowAfterLineStart(
        line,
        serviceWindowForDate(line, date, publicHolidaySet),
      );
      if (serviceWindow.seconds <= 0) {
        continue;
      }
      serviceSeconds += serviceWindow.seconds;
      for (const issue of issues) {
        if (!issueContributesToLineDowntime(issue)) {
          continue;
        }
        downtimeIntervals.push(
          ...clipIssueIntervalsToRange(
            issue,
            serviceWindow.start,
            serviceWindow.end,
          ),
        );
      }
    }
    const downtime = sumIntervalSeconds(downtimeIntervals);
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
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>,
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

        const serviceWindow = serviceWindowForDate(
          line,
          date,
          publicHolidaySet,
        );
        serviceSeconds += serviceWindow.seconds;
        const lineDowntimeIntervals: IssueIntervalBounds[] = [];

        for (const issue of issuesByLineId[line.id] ?? []) {
          if (!issueContributesToLineDowntime(issue)) {
            continue;
          }

          lineDowntimeIntervals.push(
            ...clipIssueIntervalsToRange(
              issue,
              serviceWindow.start,
              serviceWindow.end,
            ),
          );
        }

        downtimeSeconds += sumIntervalSeconds(lineDowntimeIntervals);
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
      name: isoDate(date),
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

function getWindowStart(end: DateTime, timeScale: TimeScale) {
  switch (timeScale.granularity) {
    case 'day':
      return end.startOf('day').minus({ days: timeScale.count - 1 });
    case 'month':
      return end.startOf('month').minus({ months: timeScale.count - 1 });
    case 'year':
      return end.startOf('year').minus({ years: timeScale.count - 1 });
  }
}

function getWindowEnd(start: DateTime, timeScale: TimeScale) {
  switch (timeScale.granularity) {
    case 'day':
      return start.plus({ days: timeScale.count });
    case 'month':
      return start.plus({ months: timeScale.count });
    case 'year':
      return start.plus({ years: timeScale.count });
  }
}

function getBucketEnd(start: DateTime, granularity: Granularity) {
  switch (granularity) {
    case 'day':
      return start.plus({ days: 1 });
    case 'month':
      return start.plus({ months: 1 });
    case 'year':
      return start.plus({ years: 1 });
  }
}

function getDatePlus(date: DateTime, granularity: Granularity, count: number) {
  switch (granularity) {
    case 'day':
      return date.plus({ days: count });
    case 'month':
      return date.plus({ months: count });
    case 'year':
      return date.plus({ years: count });
  }
}

function getDateMinus(date: DateTime, granularity: Granularity, count: number) {
  switch (granularity) {
    case 'day':
      return date.minus({ days: count });
    case 'month':
      return date.minus({ months: count });
    case 'year':
      return date.minus({ years: count });
  }
}

function buildStatisticsIssueCountGraphs(issues: Issue[]) {
  const end = nowSg().startOf('day');
  const aggregateForRange = (rangeStart: DateTime, rangeEnd: DateTime) => {
    const payload = emptyIssueTypePayload();
    for (const issue of issues) {
      if (issueOverlapsRange(issue, rangeStart, rangeEnd)) {
        payload[issue.type] += 1;
      }
    }
    return payload;
  };

  return STATISTICS_TIME_WINDOWS.map((window) => {
    const start = getWindowStart(end, window.dataTimeScale);
    const data: ChartEntry[] = [];
    for (let offset = 0; offset < window.dataTimeScale.count; offset++) {
      const bucketStart = getDatePlus(
        start,
        window.dataTimeScale.granularity,
        offset,
      );
      const bucketEnd = getBucketEnd(
        bucketStart,
        window.dataTimeScale.granularity,
      );
      data.push({
        name: isoDate(bucketStart),
        payload: aggregateForRange(bucketStart, bucketEnd),
      });
    }

    const currentEnd = getWindowEnd(start, window.dataTimeScale);
    const previousStart = getDateMinus(
      start,
      window.dataTimeScale.granularity,
      window.dataTimeScale.count,
    );
    return buildCountChart(
      window.title,
      data,
      [
        { name: 'current', payload: aggregateForRange(start, currentEnd) },
        { name: 'previous', payload: aggregateForRange(previousStart, start) },
      ],
      window.dataTimeScale,
      window.displayTimeScale,
    );
  });
}

function getStatisticsFactStart(end: DateTime) {
  const earliestWindow = STATISTICS_TIME_WINDOWS.reduce<DateTime | null>(
    (earliest, window) => {
      const start = getWindowStart(end, window.dataTimeScale);
      const previousStart = getDateMinus(
        start,
        window.dataTimeScale.granularity,
        window.dataTimeScale.count,
      );
      return earliest == null || previousStart < earliest
        ? previousStart
        : earliest;
    },
    null,
  );
  return earliestWindow ?? end;
}

function buildIssueCountChartsFromIssueFacts(
  rows: Array<{
    date: string;
    issue_id: string;
    issue_type: IssueType;
    active_anytime: boolean;
  }>,
) {
  const end = nowSg().startOf('day');
  const rowsByDate = groupIssueFactRowsByDate(
    rows.filter((row) => row.active_anytime),
  );
  const aggregateForRange = (
    rangeStart: DateTime,
    rangeEnd: DateTime,
  ): Record<string, number> => {
    const issueIdsByType: Record<IssueType, Set<string>> = {
      disruption: new Set(),
      maintenance: new Set(),
      infra: new Set(),
    };
    for (
      let dateTime = rangeStart.startOf('day');
      dateTime < rangeEnd;
      dateTime = dateTime.plus({ days: 1 })
    ) {
      const date = dateTime.toFormat('yyyy-MM-dd');
      for (const row of rowsByDate.get(date) ?? []) {
        issueIdsByType[row.issue_type].add(row.issue_id);
      }
    }
    return {
      disruption: issueIdsByType.disruption.size,
      maintenance: issueIdsByType.maintenance.size,
      infra: issueIdsByType.infra.size,
    };
  };

  return STATISTICS_TIME_WINDOWS.map((window) => {
    const start = getWindowStart(end, window.dataTimeScale);
    const data: ChartEntry[] = [];
    for (let offset = 0; offset < window.dataTimeScale.count; offset++) {
      const bucketStart = getDatePlus(
        start,
        window.dataTimeScale.granularity,
        offset,
      );
      const bucketEnd = getBucketEnd(
        bucketStart,
        window.dataTimeScale.granularity,
      );
      data.push({
        name: isoDate(bucketStart),
        payload: aggregateForRange(bucketStart, bucketEnd),
      });
    }

    const currentEnd = getWindowEnd(start, window.dataTimeScale);
    const previousStart = getDateMinus(
      start,
      window.dataTimeScale.granularity,
      window.dataTimeScale.count,
    );
    return buildCountChart(
      window.title,
      data,
      [
        { name: 'current', payload: aggregateForRange(start, currentEnd) },
        { name: 'previous', payload: aggregateForRange(previousStart, start) },
      ],
      window.dataTimeScale,
      window.displayTimeScale,
    );
  });
}

function buildIssueDurationGraphs(issues: Issue[]) {
  const end = nowSg().startOf('day');
  return STATISTICS_TIME_WINDOWS.map((window) => {
    const start = getWindowStart(end, window.dataTimeScale);
    const { data, cumulative } = buildPreviousWindowSummary(
      issues,
      start,
      window.dataTimeScale.count,
      window.dataTimeScale.granularity,
      true,
    );
    return buildCountChart(
      window.title,
      data,
      cumulative,
      window.dataTimeScale,
      window.displayTimeScale,
    );
  });
}

function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function selectByIdChunks<T>(
  ids: readonly string[],
  selectBatch: (ids: string[]) => Promise<T[]>,
) {
  const rows: T[] = [];
  for (const batch of chunk(ids, D1_SELECT_IN_BATCH)) {
    rows.push(...(await selectBatch(batch)));
  }
  return rows;
}

function publicMetadataKeySql() {
  return sql`${metadataTable.key} not like ${`${CROWD_REPORT_DUPLICATE_LOCK_METADATA_PREFIX}%`}`;
}

function buildIssuesByLineId(issues: Iterable<IssueWithOperationalEffects>) {
  const issuesByLineId: Record<string, IssueWithOperationalEffects[]> = {};

  for (const issue of issues) {
    for (const lineId of new Set(issue.lineIds)) {
      const lineIssues = issuesByLineId[lineId] ?? [];
      lineIssues.push(issue);
      issuesByLineId[lineId] = lineIssues;
    }
  }

  return issuesByLineId;
}

function buildOperationalFactsRebuildContext(
  dataset: BaseDataset,
): OperationalFactsRebuildContext {
  const issues = Object.values(dataset.allIssues);

  return {
    issues,
    lines: Object.values(dataset.included.lines),
    issuesByLineId: dataset.issuesByLineId,
  };
}

function buildDurationChartsFromIssueFacts(rows: IssueDayFactRow[]) {
  const end = nowSg().startOf('day');
  const countsByDate = groupIssueFactCountsByDate(rows, true);
  const aggregateForRange = (
    rangeStart: DateTime,
    rangeEnd: DateTime,
  ): IssueTypeCounts => {
    const aggregate = createIssueTypeCounts();

    for (
      let cursor = rangeStart.startOf('day');
      cursor < rangeEnd;
      cursor = cursor.plus({ days: 1 })
    ) {
      const date = isoDate(cursor);
      const dayCounts = countsByDate.get(date);
      if (dayCounts == null) {
        continue;
      }

      aggregate.disruption += dayCounts.disruption;
      aggregate.maintenance += dayCounts.maintenance;
      aggregate.infra += dayCounts.infra;
    }

    return aggregate;
  };

  return STATISTICS_TIME_WINDOWS.map((window) => {
    const start = getWindowStart(end, window.dataTimeScale);
    const data: ChartEntry[] = [];
    for (let offset = 0; offset < window.dataTimeScale.count; offset++) {
      const bucketStart = getDatePlus(
        start,
        window.dataTimeScale.granularity,
        offset,
      );
      const bucketEnd = getBucketEnd(
        bucketStart,
        window.dataTimeScale.granularity,
      );
      data.push({
        name: isoDate(bucketStart),
        payload: aggregateForRange(bucketStart, bucketEnd),
      });
    }

    const currentEnd = getWindowEnd(start, window.dataTimeScale);
    const previousStart = getDateMinus(
      start,
      window.dataTimeScale.granularity,
      window.dataTimeScale.count,
    );
    return buildCountChart(
      window.title,
      data,
      [
        { name: 'current', payload: aggregateForRange(start, currentEnd) },
        { name: 'previous', payload: aggregateForRange(previousStart, start) },
      ],
      window.dataTimeScale,
      window.displayTimeScale,
    );
  });
}

function readStringField(value: unknown, field: string) {
  if (!isRecord(value)) {
    return null;
  }

  const fieldValue = value[field];
  return typeof fieldValue === 'string' ? fieldValue : null;
}

export function isMissingTableError(error: unknown) {
  let current: unknown = error;
  const seen = new Set<unknown>();

  for (let depth = 0; current != null && depth < 6; depth++) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);

    const code = readStringField(current, 'code');
    if (code === '42P01') {
      return true;
    }

    const message =
      current instanceof Error
        ? current.message
        : readStringField(current, 'message');
    if (
      message != null &&
      /\bno such table\b/i.test(message) &&
      (message.includes('D1_ERROR') ||
        message.includes('SQLITE_ERROR') ||
        code === 'SQLITE_ERROR')
    ) {
      return true;
    }

    current = isRecord(current) ? current.cause : null;
  }

  return false;
}

async function getIssueDayFactsInRange(
  start: DateTime,
  end: DateTime,
  db?: AppDb,
) {
  const database = db ?? (await getDefaultDb());
  try {
    return await timeServerSpan('fact_issue_day_query', () =>
      database
        .select({
          date: issueDayFactsTable.date,
          issue_id: issueDayFactsTable.issue_id,
          issue_type: issueDayFactsTable.issue_type,
          active_anytime: issueDayFactsTable.active_anytime,
          duration_seconds: issueDayFactsTable.duration_seconds,
        })
        .from(issueDayFactsTable)
        .where(
          and(
            gte(issueDayFactsTable.date, isoDate(start)),
            lte(issueDayFactsTable.date, isoDate(end)),
          ),
        ),
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

async function getOperationalFactCoverageDatesInRange(
  start: DateTime,
  end: DateTime,
  db?: AppDb,
) {
  const database = db ?? (await getDefaultDb());
  try {
    return await timeServerSpan('fact_coverage_query', () =>
      database
        .select({
          date: lineDayFactsTable.date,
        })
        .from(lineDayFactsTable)
        .where(
          and(
            gte(lineDayFactsTable.date, isoDate(start)),
            lte(lineDayFactsTable.date, isoDate(end)),
          ),
        )
        .groupBy(lineDayFactsTable.date),
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

async function getOperationalFactCoverageStart(): Promise<OperationalFactCoverageStart> {
  const db = await getDefaultDb();
  try {
    const [row] = await timeServerSpan('fact_coverage_start_query', () =>
      db
        .select({
          startDate: sql<string | null>`min(${lineDayFactsTable.date})`,
        })
        .from(lineDayFactsTable),
    );
    return {
      status: 'available',
      startDate: row?.startDate ?? null,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        status: 'missing_table',
      };
    }
    throw error;
  }
}

function hasFullDateCoverage(
  rows: Array<{ date: string }>,
  start: DateTime,
  end: DateTime,
) {
  const expectedDays =
    Math.floor(end.startOf('day').diff(start.startOf('day'), 'days').days) + 1;
  if (expectedDays <= 0) {
    return false;
  }

  const dates = new Set(rows.map((row) => row.date));
  return dates.size === expectedDays;
}

export function selectLegacyHistoryFallback(
  start: DateTime,
  end: DateTime,
  today: DateTime,
  coverageRows: Array<{ date: string }>,
  coverageStart: OperationalFactCoverageStart,
  context: string,
) {
  if (end.startOf('day') >= today) {
    return true;
  }

  const coverageEnd = end.startOf('day') < today ? end.startOf('day') : today;
  if (coverageEnd < start.startOf('day')) {
    return false;
  }

  if (hasFullDateCoverage(coverageRows, start, coverageEnd)) {
    return false;
  }

  if (coverageStart.status === 'missing_table') {
    return true;
  }

  if (
    coverageStart.startDate != null &&
    start.startOf('day') <
      DateTime.fromISO(coverageStart.startDate, { zone: SG_TIMEZONE })
  ) {
    return true;
  }

  throw new Error(
    `Missing operational fact coverage for ${context}: ${start.toISODate()} to ${coverageEnd.toISODate()}`,
  );
}

async function shouldUseLegacyHistoryFallback(
  start: DateTime,
  end: DateTime,
  context: string,
) {
  const today = nowSg().startOf('day');
  if (end.startOf('day') >= today) {
    return true;
  }

  const coverageEnd = end.startOf('day') < today ? end.startOf('day') : today;
  const coverageRows =
    coverageEnd < start.startOf('day')
      ? []
      : await getOperationalFactCoverageDatesInRange(start, coverageEnd);
  const coverageStart = await getOperationalFactCoverageStart();

  return selectLegacyHistoryFallback(
    start,
    end,
    today,
    coverageRows,
    coverageStart,
    context,
  );
}

function buildDailyIssueTypeCountsFromIssues(
  issues: Issue[],
  start: DateTime,
  end: DateTime,
) {
  const countsByDate = new Map<string, IssueTypeCounts>();
  const rangeStart = start.startOf('day');
  const rangeEndExclusive = end.startOf('day').plus({ days: 1 });

  for (const issue of issues) {
    const touchedDates = new Set<string>();

    for (const interval of getIssueBounds(issue)) {
      const boundedStart =
        interval.start > rangeStart ? interval.start : rangeStart;
      const rawEnd = interval.end ?? nowSg();
      const boundedEnd =
        rawEnd < rangeEndExclusive ? rawEnd : rangeEndExclusive;

      if (boundedStart >= boundedEnd) {
        continue;
      }

      for (
        let cursor = boundedStart.startOf('day');
        cursor < boundedEnd;
        cursor = cursor.plus({ days: 1 })
      ) {
        touchedDates.add(isoDate(cursor));
      }
    }

    for (const date of touchedDates) {
      let counts = countsByDate.get(date);
      if (counts == null) {
        counts = createIssueTypeCounts();
        countsByDate.set(date, counts);
      }

      addIssueTypeCount(counts, issue.type, 1);
    }
  }

  return countsByDate;
}

function buildLineOperationalFactRow(
  line: Line,
  lineIssues: IssueWithOperationalEffects[],
  normalizedDate: DateTime,
  publicHolidaySet: Set<string>,
  asOf: DateTime,
): typeof lineDayFactsTable.$inferInsert {
  const issueCounts = createIssueTypeCounts();
  const downtimeIntervalsByIssueType = createIssueTypeIntervalGroups();
  const lineFuture = isLineFuture(line, normalizedDate.endOf('day'));
  const serviceWindow = serviceWindowForDate(
    line,
    normalizedDate,
    publicHolidaySet,
  );

  for (const issue of lineIssues) {
    if (issueTouchesDate(issue, normalizedDate)) {
      addIssueTypeCount(issueCounts, issue.type, 1);
    }

    if (lineFuture || !issueContributesToLineDowntime(issue)) {
      continue;
    }

    downtimeIntervalsByIssueType[issue.type].push(
      ...clipIssueIntervalsToRange(
        issue,
        serviceWindow.start,
        serviceWindow.end,
        asOf,
      ),
    );
  }

  const downtimeSeconds = sumIssueTypeIntervalGroups(
    downtimeIntervalsByIssueType,
    asOf,
  );

  return {
    date: isoDate(normalizedDate),
    line_id: line.id,
    as_of: isoDateTime(asOf),
    service_seconds: Math.round(lineFuture ? 0 : serviceWindow.seconds),
    downtime_disruption_seconds: Math.round(downtimeSeconds.disruption),
    downtime_maintenance_seconds: Math.round(downtimeSeconds.maintenance),
    downtime_infra_seconds: Math.round(downtimeSeconds.infra),
    issue_count_disruption: issueCounts.disruption,
    issue_count_maintenance: issueCounts.maintenance,
    issue_count_infra: issueCounts.infra,
  };
}

function buildOperationalFactRowsForDate(
  date: DateTime,
  dataset: BaseDataset,
  context: OperationalFactsRebuildContext,
): OperationalFactRowsForDate {
  const normalizedDate = date.setZone(SG_TIMEZONE).startOf('day');
  const asOf = normalizedDate.endOf('day');
  const dateKey = isoDate(normalizedDate);
  const dayEnd = normalizedDate.plus({ days: 1 });

  const issueRows = context.issues
    .map((issue) => {
      const intervals = getIssueBounds(issue)
        .map((interval) =>
          clipIntervalToRange(
            interval.start,
            interval.end,
            normalizedDate,
            dayEnd,
            asOf,
          ),
        )
        .filter((interval) => interval != null);
      const durationSeconds = sumIntervalSeconds(intervals, asOf);

      return {
        date: dateKey,
        issue_id: issue.id,
        issue_type: issue.type,
        as_of: isoDateTime(asOf),
        active_anytime: durationSeconds > 0,
        active_end_of_day: issueActiveNow(issue, asOf),
        duration_seconds: Math.round(durationSeconds),
        inferred_interval_count: 0,
      };
    })
    .filter((row) => row.active_anytime || row.active_end_of_day);

  const lineRows = context.lines.map((line) =>
    buildLineOperationalFactRow(
      line,
      context.issuesByLineId[line.id] ?? [],
      normalizedDate,
      dataset.publicHolidaySet,
      asOf,
    ),
  );

  return {
    date: dateKey,
    issueRows,
    lineRows,
  };
}

async function replaceOperationalFactRows(
  database: AppDb,
  rowsByDate: OperationalFactRowsForDate[],
) {
  const dates = rowsByDate.map((rows) => rows.date);
  const issueRows = rowsByDate.flatMap((rows) => rows.issueRows);
  const lineRows = rowsByDate.flatMap((rows) => rows.lineRows);

  await database.transaction(async (tx) => {
    for (const batch of chunk(dates, OPERATIONAL_FACTS_REBUILD_DAY_BATCH)) {
      if (batch.length === 0) {
        continue;
      }
      await tx
        .delete(issueDayFactsTable)
        .where(inArray(issueDayFactsTable.date, batch));
      await tx
        .delete(lineDayFactsTable)
        .where(inArray(lineDayFactsTable.date, batch));
    }

    for (const batch of chunk(issueRows, OPERATIONAL_FACTS_WRITE_BATCH)) {
      if (batch.length > 0) {
        await tx.insert(issueDayFactsTable).values(batch);
      }
    }
    for (const batch of chunk(lineRows, OPERATIONAL_FACTS_WRITE_BATCH)) {
      if (batch.length > 0) {
        await tx.insert(lineDayFactsTable).values(batch);
      }
    }
  });
}

async function rebuildOperationalFactsForDateFromDataset(
  date: DateTime,
  dataset: BaseDataset,
  db?: AppDb,
  context = buildOperationalFactsRebuildContext(dataset),
) {
  const database = db ?? (await getDefaultDb());
  const rows = buildOperationalFactRowsForDate(date, dataset, context);

  await replaceOperationalFactRows(database, [rows]);

  return {
    date: rows.date,
    issueCount: rows.issueRows.length,
    lineCount: rows.lineRows.length,
  };
}

export async function rebuildOperationalFactsForDate(
  date: DateTime,
  db?: AppDb,
) {
  const normalizedDate = date.setZone(SG_TIMEZONE).startOf('day');
  const dataset = await buildBaseDataset(normalizedDate.endOf('day'), db);
  return rebuildOperationalFactsForDateFromDataset(normalizedDate, dataset, db);
}

export async function rebuildOperationalFactsForDates(
  dates: readonly string[],
  db?: AppDb,
) {
  const normalizedDates = [
    ...new Set(
      dates.map((date) => {
        const parsed = DateTime.fromISO(date, { zone: SG_TIMEZONE });
        if (!parsed.isValid) {
          throw new Error(`Invalid operational fact date: ${date}`);
        }
        return isoDate(parsed.startOf('day'));
      }),
    ),
  ].sort();
  if (normalizedDates.length === 0) {
    return [];
  }

  const dateTimes = normalizedDates.map((date) =>
    DateTime.fromISO(date, { zone: SG_TIMEZONE }),
  );
  const latestDate = dateTimes.reduce((latest, date) =>
    date > latest ? date : latest,
  );
  const dataset = await buildBaseDataset(latestDate.endOf('day'), db);
  const context = buildOperationalFactsRebuildContext(dataset);
  const database = db ?? (await getDefaultDb());
  const results: Array<{
    date: string;
    issueCount: number;
    lineCount: number;
  }> = [];

  for (const batch of chunk(dateTimes, OPERATIONAL_FACTS_REBUILD_DAY_BATCH)) {
    const rowsByDate = batch.map((date) =>
      buildOperationalFactRowsForDate(date, dataset, context),
    );
    await replaceOperationalFactRows(database, rowsByDate);
    results.push(
      ...rowsByDate.map((rows) => ({
        date: rows.date,
        issueCount: rows.issueRows.length,
        lineCount: rows.lineRows.length,
      })),
    );
  }

  return results;
}

export async function rebuildOperationalFactsRange(
  days: number,
  end = nowSg(),
  db?: AppDb,
) {
  const normalizedEnd = end.setZone(SG_TIMEZONE).startOf('day');
  const dataset = await buildBaseDataset(normalizedEnd.endOf('day'), db);
  const context = buildOperationalFactsRebuildContext(dataset);
  const database = db ?? (await getDefaultDb());
  const results: Array<{
    date: string;
    issueCount: number;
    lineCount: number;
  }> = [];

  const dates = Array.from({ length: days }, (_, index) =>
    normalizedEnd.minus({ days: days - 1 - index }),
  );
  for (const batch of chunk(dates, OPERATIONAL_FACTS_REBUILD_DAY_BATCH)) {
    const rowsByDate = batch.map((date) =>
      buildOperationalFactRowsForDate(date, dataset, context),
    );
    await replaceOperationalFactRows(database, rowsByDate);
    results.push(
      ...rowsByDate.map((rows) => ({
        date: rows.date,
        issueCount: rows.issueRows.length,
        lineCount: rows.lineRows.length,
      })),
    );
  }
  return results;
}

export async function getRootData() {
  return timeServerSpan('root_data', async () => {
    const db = await getDefaultDb();
    const [lineRows, metadataRows, operatorRows] = await timeServerSpan(
      'root_nav_queries',
      () =>
        Promise.all([
          timeDbQuery('root_q_lines', () =>
            db
              .select({
                id: linesTable.id,
                name: linesTable.name,
                color: linesTable.color,
              })
              .from(linesTable)
              .orderBy(asc(linesTable.id)),
          ),
          timeDbQuery('root_q_metadata', () =>
            db
              .select()
              .from(metadataTable)
              .where(publicMetadataKeySql())
              .orderBy(asc(metadataTable.key)),
          ),
          timeDbQuery('root_q_operators', () =>
            db
              .select({
                id: operatorsTable.id,
                name: operatorsTable.name,
              })
              .from(operatorsTable)
              .orderBy(asc(operatorsTable.id)),
          ),
        ]),
    );

    return {
      lineNavItems: lineRows,
      metadata: metadataRows,
      operatorNavItems: operatorRows,
    };
  });
}

async function getPageCommunitySignals(
  options: CommunitySignalOptions,
  scope: { lineId?: string; stationId?: string } = {},
) {
  if (!options.includeCommunitySignals) {
    return [];
  }

  const communitySignalsDb = await getDefaultDb();
  return getPublicCrowdReportSignals(communitySignalsDb, scope);
}

export async function getOverviewData(
  days: number,
  options: CommunitySignalOptions = {},
) {
  return timeServerSpan('overview_data', async () => {
    const dataset = await getBaseDataset();
    const issues = Object.values(dataset.allIssues);
    const lineSummaries = timeSyncServerSpan('overview_line_summaries', () =>
      rankLineSummaries(
        Object.values(dataset.included.lines).map((line) => {
          const lineIssues = dataset.issuesByLineId[line.id] ?? [];
          return buildLineSummary(
            line,
            lineIssues,
            days,
            dataset.publicHolidaySet,
          );
        }),
      ),
    );

    const overview = {
      issueIdsActiveNow: issues
        .filter((issue) => issue.type === 'disruption' && issueActiveNow(issue))
        .map((issue) => issue.id),
      issueIdsActiveToday: issues
        .filter(
          (issue) =>
            (issue.type === 'maintenance' || issue.type === 'infra') &&
            issueActiveToday(issue),
        )
        .map((issue) => issue.id),
      lineSummaries,
      communitySignals: await getPageCommunitySignals(options),
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
    const overviewCommunitySignalStationIds = [
      ...new Set(
        overview.communitySignals.flatMap((signal) => signal.stationIds),
      ),
    ];

    return {
      data: overview,
      included: selectIncludedEntities(dataset.included, dataset.allIssues, {
        issueIds: overviewIssueIds,
        lineIds: overview.lineSummaries.map((summary) => summary.lineId),
        stationIds: overviewCommunitySignalStationIds,
        includeStationMembershipLines: true,
      }),
    };
  });
}

export async function getLineProfileData(
  lineId: string,
  days: number,
  options: CommunitySignalOptions = {},
) {
  const dataset = await getBaseDataset();
  const line = dataset.included.lines[lineId];
  if (line == null) {
    throw new Response('Line not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const allLineSummaries = rankLineSummaries(
    Object.values(dataset.included.lines).map((candidateLine) => {
      const candidateIssues = dataset.issuesByLineId[candidateLine.id] ?? [];
      return buildLineSummary(
        candidateLine,
        candidateIssues,
        days,
        dataset.publicHolidaySet,
      );
    }),
  );

  const lineIssues = dataset.issuesByLineId[lineId] ?? [];
  const rankedSummary = allLineSummaries.find(
    (summary) => summary.lineId === lineId,
  );
  if (rankedSummary == null) {
    throw new Response('Line not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }
  const issueIdsRecent = [...lineIssues]
    .filter((issue) =>
      issue.intervals.some(
        (interval) => parseDateTime(interval.startAt) <= nowSg(),
      ),
    )
    .sort((a, b) => {
      const earliestA = Math.min(
        ...a.intervals.map((interval) =>
          parseDateTime(interval.startAt).toMillis(),
        ),
      );
      const earliestB = Math.min(
        ...b.intervals.map((interval) =>
          parseDateTime(interval.startAt).toMillis(),
        ),
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

  const profile = {
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
    communitySignals: await getPageCommunitySignals(options, { lineId }),
  };
  const profileIssueIds = [
    ...new Set(
      [...issueIdsRecent, profile.issueIdNextMaintenance].filter(
        (value): value is string => value != null,
      ),
    ),
  ];

  return {
    data: profile,
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: profileIssueIds,
      lineIds: [lineId],
      stationIds: Object.keys(dataset.included.stations),
      operatorIds: line.operators.map((operator) => operator.operatorId),
      includeStationMembershipLines: true,
    }),
  };
}

export async function getIssueData(issueId: string) {
  const db = await getDefaultDb();
  const [dataset, evidenceRows] = await Promise.all([
    getBaseDataset(),
    db
      .select()
      .from(evidencesTable)
      .where(eq(evidencesTable.issue_id, issueId))
      .orderBy(desc(evidencesTable.ts)),
  ]);
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
      updates: evidenceRows.map((evidence) => ({
        type: evidence.type,
        text: evidence.text,
        textTranslations: evidence.render?.text ?? null,
        sourceUrl: evidence.source_url,
        createdAt: evidence.ts,
      })),
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: [issueId],
      includeStationMembershipLines: true,
    }),
  };
}

export async function getStationProfileData(
  stationId: string,
  options: CommunitySignalOptions = {},
) {
  const dataset = await getBaseDataset();
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

  let status: LineSummaryStatus = 'normal';
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
  const communitySignals = await getPageCommunitySignals(options, {
    stationId,
  });

  return {
    data: {
      stationId,
      status,
      issueIdsRecent,
      issueCountByType: pickIssueTypes(issues),
      communitySignals,
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: issueIdsRecent,
      lineIds: [
        ...new Set(communitySignals.flatMap((signal) => signal.lineIds)),
      ],
      stationIds: [
        stationId,
        ...new Set(communitySignals.flatMap((signal) => signal.stationIds)),
      ],
      includeStationDetailEntities: true,
      includeStationMembershipLines: true,
    }),
  };
}

export async function getOperatorProfileData(operatorId: string, days: number) {
  const dataset = await getBaseDataset();
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
  const lineIdSet = new Set(lineIds);

  const lineSummaries = Object.fromEntries(
    lineIds.map((lineId) => {
      const line = dataset.included.lines[lineId];
      const lineIssues = dataset.issuesByLineId[lineId] ?? [];
      return [
        lineId,
        buildLineSummary(line, lineIssues, days, dataset.publicHolidaySet),
      ];
    }),
  ) as Record<string, LineSummary>;
  const operatorLines = lineIds.map((lineId) => dataset.included.lines[lineId]);
  const operatorIssuesByLineId = Object.fromEntries(
    lineIds.map((lineId) => [lineId, dataset.issuesByLineId[lineId] ?? []]),
  ) as Record<string, IssueWithOperationalEffects[]>;

  const operatorIssues = Object.values(dataset.allIssues).filter((issue) =>
    issue.lineIds.some((lineId) => lineIdSet.has(lineId)),
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
      issueCount: (operatorIssuesByLineId[lineId] ?? []).length,
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

  let currentOperationalStatus: OperatorOperationalStatus = 'all_operational';
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

  const profile = {
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
        nowSg().diff(parseDateTime(operator.foundedAt), 'years').years,
      ),
    ),
  };

  return {
    data: profile,
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: profile.issueIdsRecent,
      lineIds: profile.lineIds,
      operatorIds: [operatorId],
      includeStationMembershipLines: true,
    }),
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
  const yearStart = DateTime.fromObject(
    { year, month: 1, day: 1 },
    { zone: SG_TIMEZONE },
  ).startOf('day');
  const yearEnd = yearStart.plus({ years: 1 });
  const factRows = await getIssueDayFactsInRange(
    yearStart,
    yearEnd.minus({ days: 1 }),
  );
  if (
    await shouldUseLegacyHistoryFallback(
      yearStart,
      yearEnd.minus({ days: 1 }),
      `history year ${year}`,
    )
  ) {
    const dataset = await getBaseDataset();
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
        month: isoDate(monthStart),
        issueCountsByType: pickIssueTypes(monthIssues),
        totalCount: monthIssues.length,
      };
    }).reverse();

    return {
      data: {
        startAt: isoDate(yearStart),
        endAt: isoDate(yearEnd.minus({ day: 1 })),
        summaryByMonth,
      },
      included: selectIncludedEntities(dataset.included, dataset.allIssues, {
        issueIds: issues.map((issue) => issue.id),
        includeStationMembershipLines: true,
      }),
    };
  }
  const issueIds = [...new Set(factRows.map((row) => row.issue_id))];
  const included = await getIncludedForIssueIds(issueIds);
  const uniqueIssuesByMonth = Array.from(
    { length: 12 },
    () => new Map<string, IssueType>(),
  );

  for (const row of factRows) {
    const date = parseDateTime(row.date);
    uniqueIssuesByMonth[date.month - 1]?.set(
      row.issue_id,
      row.issue_type as IssueType,
    );
  }

  const summaryByMonth = Array.from({ length: 12 }, (_, index) => {
    const monthStart = DateTime.fromObject(
      { year, month: index + 1, day: 1 },
      { zone: SG_TIMEZONE },
    ).startOf('day');
    const uniqueIssues =
      uniqueIssuesByMonth[index] ?? new Map<string, IssueType>();
    const issueCountsByType = [...uniqueIssues.values()].reduce<
      Partial<Record<IssueType, number>>
    >((acc, type) => {
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
    return {
      month: isoDate(monthStart),
      issueCountsByType,
      totalCount: uniqueIssues.size,
    };
  }).reverse();

  return {
    data: {
      startAt: isoDate(yearStart),
      endAt: isoDate(yearEnd.minus({ day: 1 })),
      summaryByMonth,
    },
    included,
  };
}

export async function getHistoryYearMonthData(year: number, month: number) {
  const monthStart = DateTime.fromObject(
    { year, month, day: 1 },
    { zone: SG_TIMEZONE },
  ).startOf('day');
  const monthEnd = monthStart.plus({ months: 1 });
  const factRows = await getIssueDayFactsInRange(
    monthStart,
    monthEnd.minus({ days: 1 }),
  );
  if (
    await shouldUseLegacyHistoryFallback(
      monthStart,
      monthEnd.minus({ days: 1 }),
      `history month ${year}-${month.toString().padStart(2, '0')}`,
    )
  ) {
    const dataset = await getBaseDataset();

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
          issueOverlapsRange(
            issue,
            date.startOf('week'),
            date.startOf('week').plus({ week: 1 }),
          ),
        )
        .map((issue) => issue.id)
        .sort((a, b) => b.localeCompare(a));
      if (issueIds.length > 0 || !weeks.has(key)) {
        weeks.set(key, issueIds);
      }
    }

    return {
      data: {
        startAt: isoDate(monthStart),
        endAt: isoDate(monthEnd.minus({ day: 1 })),
        issuesByWeek: [...weeks.entries()]
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([week, issueIds]) => ({
            week,
            issueIds,
          })),
      },
      included: selectIncludedEntities(dataset.included, dataset.allIssues, {
        issueIds: issues.map((issue) => issue.id),
        includeStationMembershipLines: true,
      }),
    };
  }
  const issueIds = [...new Set(factRows.map((row) => row.issue_id))];
  const included = await getIncludedForIssueIds(issueIds);
  const weeks = new Map<string, Set<string>>();

  for (
    let date = monthStart.startOf('week');
    date < monthEnd.endOf('week');
    date = date.plus({ week: 1 })
  ) {
    const key = `${date.weekYear}-W${date.weekNumber.toString().padStart(2, '0')}`;
    weeks.set(key, new Set());
  }

  for (const row of factRows) {
    const date = parseDateTime(row.date);
    const key = `${date.weekYear}-W${date.weekNumber.toString().padStart(2, '0')}`;
    const issueIdsForWeek = weeks.get(key);
    if (issueIdsForWeek != null) {
      issueIdsForWeek.add(row.issue_id);
    }
  }

  return {
    data: {
      startAt: isoDate(monthStart),
      endAt: isoDate(monthEnd.minus({ day: 1 })),
      issuesByWeek: [...weeks.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([week, ids]) => ({
          week,
          issueIds: [...ids].sort((a, b) => b.localeCompare(a)),
        })),
    },
    included,
  };
}

export async function getHistoryDayData(
  year: number,
  month: number,
  day: number,
) {
  const date = DateTime.fromObject({ year, month, day }, { zone: SG_TIMEZONE });
  const factRows = await getIssueDayFactsInRange(date, date);
  if (await shouldUseLegacyHistoryFallback(date, date, `history day ${date}`)) {
    const dataset = await getBaseDataset();
    const issues = Object.values(dataset.allIssues).filter((issue) =>
      issueTouchesDate(issue, date),
    );
    const issueIds = issues
      .map((issue) => issue.id)
      .sort((a, b) => b.localeCompare(a));

    return {
      data: {
        startAt: isoDate(date),
        endAt: isoDate(date),
        issueIds,
      },
      included: selectIncludedEntities(dataset.included, dataset.allIssues, {
        issueIds,
        includeStationMembershipLines: true,
      }),
    };
  }
  const issueIds = [...new Set(factRows.map((row) => row.issue_id))].sort(
    (a, b) => b.localeCompare(a),
  );
  const included = await getIncludedForIssueIds(issueIds);

  return {
    data: {
      startAt: isoDate(date),
      endAt: isoDate(date),
      issueIds,
    },
    included,
  };
}

const STATISTICS_SNAPSHOT_ID = 'latest';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isSystemAnalytics(value: unknown): value is SystemAnalytics {
  return (
    isRecord(value) &&
    Array.isArray(
      (value as Partial<SystemAnalytics>).timeScaleChartsIssueCount,
    ) &&
    Array.isArray(
      (value as Partial<SystemAnalytics>).timeScaleChartsIssueDuration,
    ) &&
    Array.isArray(
      (value as Partial<SystemAnalytics>).chartTotalIssueCountByLine?.data,
    ) &&
    Array.isArray(
      (value as Partial<SystemAnalytics>).chartTotalIssueCountByStation?.data,
    ) &&
    Array.isArray(
      (value as Partial<SystemAnalytics>).chartRollingYearHeatmap?.data,
    ) &&
    Array.isArray((value as Partial<SystemAnalytics>).issueIdsDisruptionLongest)
  );
}

function isIncludedEntities(value: unknown): value is IncludedEntities {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRecord(value.issues) &&
    isRecord(value.lines) &&
    isRecord(value.stations) &&
    isRecord(value.operators) &&
    isRecord(value.towns) &&
    isRecord(value.landmarks)
  );
}

function isStatisticsSnapshotPayload(
  value: unknown,
): value is StatisticsSnapshotPayload {
  return (
    isRecord(value) &&
    value.kind === 'statistics_snapshot.v1' &&
    isSystemAnalytics(value.data) &&
    isIncludedEntities(value.included)
  );
}

export function parseStatisticsSnapshotPayload(value: unknown): {
  data: SystemAnalytics;
  included: IncludedEntities | null;
} | null {
  if (isStatisticsSnapshotPayload(value)) {
    return {
      data: value.data,
      included: value.included,
    };
  }

  if (isSystemAnalytics(value)) {
    return {
      data: value,
      included: null,
    };
  }

  return null;
}

async function getLatestStatisticsSnapshot(db?: AppDb) {
  const database = db ?? (await getDefaultDb());
  try {
    const [snapshot] = await timeServerSpan('statistics_snapshot_query', () =>
      database
        .select({
          data: statisticsSnapshotsTable.data,
        })
        .from(statisticsSnapshotsTable)
        .where(eq(statisticsSnapshotsTable.id, STATISTICS_SNAPSHOT_ID))
        .limit(1),
    );
    return parseStatisticsSnapshotPayload(snapshot?.data);
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}

function getStatisticsIncluded(
  dataset: BaseDataset,
  statistics: SystemAnalytics,
) {
  return selectIncludedEntities(dataset.included, dataset.allIssues, {
    issueIds: statistics.issueIdsDisruptionLongest,
    lineIds: statistics.chartTotalIssueCountByLine.data.map(
      (entry) => entry.name,
    ),
    stationIds: statistics.chartTotalIssueCountByStation.data.map(
      (entry) => entry.name,
    ),
    includeStationMembershipLines: true,
  });
}

async function buildStatisticsDataFromDataset(
  dataset: BaseDataset,
  db?: AppDb,
) {
  return timeServerSpan('statistics_build', async () => {
    const issues = Object.values(dataset.allIssues);
    const rollingYearEnd = nowSg().startOf('day');
    const rollingYearStart = rollingYearEnd.minus({ days: 364 });
    const statisticsFactStart = getStatisticsFactStart(rollingYearEnd);
    const issueFactRows = await getIssueDayFactsInRange(
      statisticsFactStart,
      rollingYearEnd,
      db,
    );
    const rollingYearFactCoverageRows =
      await getOperationalFactCoverageDatesInRange(
        rollingYearStart,
        rollingYearEnd,
        db,
      );
    const statisticsFactCoverageRows =
      await getOperationalFactCoverageDatesInRange(
        statisticsFactStart,
        rollingYearEnd,
        db,
      );
    const hasRollingYearIssueFactCoverage = hasFullDateCoverage(
      rollingYearFactCoverageRows,
      rollingYearStart,
      rollingYearEnd,
    );
    const hasStatisticsIssueFactCoverage = hasFullDateCoverage(
      statisticsFactCoverageRows,
      statisticsFactStart,
      rollingYearEnd,
    );
    const { lineCountsById, stationCountsById } = timeSyncServerSpan(
      'statistics_entity_counts',
      () => {
        const lineCountsById: Record<string, IssueTypeBreakdown> = {};
        const stationCountsById: Record<string, IssueTypeBreakdown> = {};

        for (const issue of issues) {
          for (const lineId of new Set(issue.lineIds)) {
            lineCountsById[lineId] ??= createIssueTypeBreakdown();
            const counts = lineCountsById[lineId];
            addIssueTypeCount(counts, issue.type, 1);
            counts.totalIssues += 1;
          }

          const stationIds = new Set(
            issue.branchesAffected.flatMap((branch) => branch.stationIds),
          );
          for (const stationId of stationIds) {
            stationCountsById[stationId] ??= createIssueTypeBreakdown();
            const counts = stationCountsById[stationId];
            addIssueTypeCount(counts, issue.type, 1);
            counts.totalIssues += 1;
          }
        }

        return { lineCountsById, stationCountsById };
      },
    );

    const longestDisruptions = timeSyncServerSpan(
      'statistics_longest_disruptions',
      () =>
        [...issues]
          .filter((issue) => issue.type === 'disruption')
          .sort((a, b) => b.durationSeconds - a.durationSeconds)
          .slice(0, 10)
          .map((issue) => issue.id),
    );

    const chartTotalIssueCountByLine = timeSyncServerSpan(
      'statistics_line_chart',
      () => ({
        title: 'Issue Count by Line',
        data: Object.values(dataset.included.lines).map((line) => {
          const counts = lineCountsById[line.id] ?? createIssueTypeBreakdown();
          return {
            name: line.id,
            payload: {
              disruption: counts.disruption,
              maintenance: counts.maintenance,
              infra: counts.infra,
              totalIssues: counts.totalIssues,
            },
          };
        }),
      }),
    );

    const stationIssueCounts = timeSyncServerSpan(
      'statistics_station_counts',
      () =>
        Object.values(dataset.included.stations).map((station) => {
          const counts =
            stationCountsById[station.id] ?? createIssueTypeBreakdown();
          return {
            name: station.id,
            payload: {
              disruption: counts.disruption,
              maintenance: counts.maintenance,
              infra: counts.infra,
              totalIssues: counts.totalIssues,
            },
          };
        }),
    );

    const heatmapCountsByDate = timeSyncServerSpan(
      'statistics_heatmap_counts',
      () =>
        hasRollingYearIssueFactCoverage
          ? groupIssueFactCountsByDate(issueFactRows)
          : buildDailyIssueTypeCountsFromIssues(
              issues,
              rollingYearStart,
              rollingYearEnd,
            ),
    );

    const topStationIssueCounts = timeSyncServerSpan(
      'statistics_top_station_counts',
      () =>
        stationIssueCounts
          .sort(
            (a, b) =>
              (b.payload.totalIssues as number) -
              (a.payload.totalIssues as number),
          )
          .slice(0, 15),
    );

    const chartTotalIssueCountByStation = timeSyncServerSpan(
      'statistics_station_chart',
      () => ({
        title: 'Issue Count by Station',
        data: topStationIssueCounts,
      }),
    );

    const chartRollingYearHeatmap = timeSyncServerSpan(
      'statistics_heatmap_chart',
      () => ({
        title: 'Rolling Year Heatmap',
        data: Array.from({ length: 365 }, (_, index) => {
          const date = isoDate(rollingYearStart.plus({ days: index }));
          return {
            name: date,
            payload: {
              ...(heatmapCountsByDate.get(date) ?? createIssueTypeCounts()),
            },
          };
        }),
      }),
    );

    return {
      timeScaleChartsIssueCount: timeSyncServerSpan(
        'statistics_count_charts',
        () =>
          hasStatisticsIssueFactCoverage
            ? buildIssueCountChartsFromIssueFacts(issueFactRows)
            : buildStatisticsIssueCountGraphs(issues),
      ),
      timeScaleChartsIssueDuration: timeSyncServerSpan(
        'statistics_duration_charts',
        () =>
          hasStatisticsIssueFactCoverage
            ? buildDurationChartsFromIssueFacts(issueFactRows)
            : buildIssueDurationGraphs(issues),
      ),
      chartTotalIssueCountByLine,
      chartTotalIssueCountByStation,
      chartRollingYearHeatmap,
      issueIdsDisruptionLongest: longestDisruptions,
    } satisfies SystemAnalytics;
  });
}

export async function rebuildStatisticsSnapshot(db?: AppDb) {
  return timeServerSpan('statistics_snapshot_rebuild', async () => {
    const database = db ?? (await getDefaultDb());
    const asOf = isoDateTime(nowSg());
    const dataset = await buildDataset(nowSg(), database);
    const data = await buildStatisticsDataFromDataset(dataset, database);
    const included = timeSyncServerSpan('statistics_snapshot_included', () =>
      getStatisticsIncluded(dataset, data),
    );
    const snapshotPayload = {
      kind: 'statistics_snapshot.v1',
      data,
      included,
    } satisfies StatisticsSnapshotPayload;
    await timeServerSpan('statistics_snapshot_upsert', () =>
      database
        .insert(statisticsSnapshotsTable)
        .values({
          id: STATISTICS_SNAPSHOT_ID,
          as_of: asOf,
          data: snapshotPayload,
        })
        .onConflictDoUpdate({
          target: [statisticsSnapshotsTable.id],
          set: {
            as_of: asOf,
            data: snapshotPayload,
            updated_at: asOf,
          },
        }),
    );
    return {
      asOf,
      issueIdsDisruptionLongest: data.issueIdsDisruptionLongest,
    };
  });
}

export async function getStatisticsData() {
  return timeServerSpan('statistics_data', async () => {
    const snapshot = await getLatestStatisticsSnapshot();
    if (snapshot != null) {
      if (snapshot.included != null) {
        recordServerTiming('statistics_included', 0, 'source=snapshot');
        return {
          data: snapshot.data,
          included: snapshot.included,
        };
      }

      const dataset = await timeServerSpan('statistics_included_dataset', () =>
        buildDataset(
          nowSg(),
          undefined,
          snapshot.data.issueIdsDisruptionLongest,
        ),
      );
      return {
        data: snapshot.data,
        included: timeSyncServerSpan('statistics_included', () =>
          getStatisticsIncluded(dataset, snapshot.data),
        ),
      };
    }

    const dataset = await getBaseDataset();
    const statistics = await buildStatisticsDataFromDataset(dataset);
    return {
      data: statistics,
      included: timeSyncServerSpan('statistics_included', () =>
        getStatisticsIncluded(dataset, statistics),
      ),
    };
  });
}

export async function getSitemapData() {
  const dataset = await getBaseDataset();
  const skippedIssueIds: string[] = [];
  const issuesWithFirstDates = Object.values(dataset.allIssues).flatMap(
    (issue) => {
      const firstInterval = issue.intervals[0];
      if (firstInterval == null) {
        return [];
      }

      const firstDate = parseDateTime(firstInterval.startAt);
      if (!firstDate.isValid) {
        skippedIssueIds.push(issue.id);
        return [];
      }

      return [{ firstDate, issue }];
    },
  );
  const firstDates = issuesWithFirstDates.map(({ firstDate }) => firstDate);
  const earliest = firstDates.sort((a, b) => a.toMillis() - b.toMillis())[0];
  const latest = firstDates.sort((a, b) => b.toMillis() - a.toMillis())[0];

  const monthEarliest =
    earliest != null ? isoDate(earliest.startOf('month')) : isoDate(nowSg());
  const monthLatest =
    latest != null ? isoDate(latest.startOf('month')) : isoDate(nowSg());
  const monthEarliestDateTime = DateTime.fromISO(monthEarliest, {
    zone: SG_TIMEZONE,
  });
  const monthLatestDateTime = DateTime.fromISO(monthLatest, {
    zone: SG_TIMEZONE,
  });
  const coverageRows = await getOperationalFactCoverageDatesInRange(
    monthEarliestDateTime,
    monthLatestDateTime.endOf('month'),
  );
  const operationalFactCoverageStart = await getOperationalFactCoverageStart();
  const operationalFactCoverageStartDate =
    operationalFactCoverageStart.status === 'available'
      ? operationalFactCoverageStart.startDate
      : null;

  if (skippedIssueIds.length > 0) {
    console.warn('[SITEMAP] Skipped issues with invalid first interval dates', {
      count: skippedIssueIds.length,
      issueIds: skippedIssueIds.slice(0, 20),
    });
  }

  return {
    lineIds: Object.keys(dataset.included.lines).sort(),
    stationIds: Object.keys(dataset.included.stations).sort(),
    operatorIds: Object.keys(dataset.included.operators).sort(),
    issueIds: issuesWithFirstDates.map(({ issue }) => issue.id),
    monthEarliest,
    monthLatest,
    operationalFactCoverageDates: coverageRows.map((row) => row.date),
    operationalFactCoverageMissing:
      operationalFactCoverageStart.status === 'missing_table',
    operationalFactCoverageStartDate,
    currentDate: isoDate(nowSg()),
  };
}

export type LineBranch = Awaited<
  ReturnType<typeof getLineProfileData>
>['data']['branches'][number];

export type OperatorProfile = Awaited<
  ReturnType<typeof getOperatorProfileData>
>['data'];
