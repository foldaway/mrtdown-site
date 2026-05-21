import type {
  CauseSubtype,
  Issue as CoreIssue,
  IssueType,
  Landmark as CoreLandmark,
  Line as CoreLine,
  OperatingHours,
  Operator as CoreOperator,
  Station as CoreStation,
  Town as CoreTown,
  Translations,
} from '@mrtdown/core';

type AppTranslations = Translations & Record<string, string | null | undefined>;

type StationCode = CoreStation['stationCodes'][number];

export type Line = Pick<
  CoreLine,
  'id' | 'type' | 'color' | 'startedAt' | 'operators'
> & {
  title: string;
  titleTranslations: AppTranslations;
  operatingHours: OperatingHours;
};

type StationLineMembership = Pick<
  StationCode,
  'lineId' | 'code' | 'startedAt' | 'structureType'
> & {
  branchId: string;
  endedAt?: NonNullable<StationCode['endedAt']>;
  sequenceOrder: number;
};

export type Station = Pick<
  CoreStation,
  'id' | 'geo' | 'townId' | 'landmarkIds'
> & {
  name: string;
  nameTranslations: AppTranslations;
  memberships: StationLineMembership[];
};

export type IssueAffectedBranch = {
  lineId: string;
  branchId: string;
  stationIds: string[];
};

export type IssueInterval = {
  startAt: string;
  endAt: string | null;
  status: 'ongoing' | 'ended' | 'future';
};

export type Issue = Pick<CoreIssue, 'id' | 'type'> & {
  title: string;
  titleTranslations: AppTranslations;
  subtypes: CauseSubtype[];
  durationSeconds: number;
  lineIds: string[];
  branchesAffected: IssueAffectedBranch[];
  intervals: IssueInterval[];
};

type Landmark = Pick<CoreLandmark, 'id'> & {
  name: string;
  nameTranslations: AppTranslations;
};

type Town = Pick<CoreTown, 'id'> & {
  name: string;
  nameTranslations: AppTranslations;
};

type Operator = Pick<CoreOperator, 'id' | 'foundedAt' | 'url'> & {
  name: string;
  nameTranslations: AppTranslations;
};

export type IncludedEntities = {
  lines: Record<string, Line>;
  stations: Record<string, Station>;
  issues: Record<string, Issue>;
  landmarks: Record<string, Landmark>;
  towns: Record<string, Town>;
  operators: Record<string, Operator>;
};

export type LineSummaryStatus =
  | 'future_service'
  | 'closed_for_day'
  | 'ongoing_disruption'
  | 'ongoing_maintenance'
  | 'ongoing_infra'
  | 'normal';

export type LineSummaryDayType = 'weekday' | 'weekend' | 'public_holiday';

export type LineSummaryDateRecord = {
  breakdownByIssueTypes: {
    [key in IssueType]?: {
      totalDurationSeconds: number;
      issueIds: string[];
    };
  };
  dayType: LineSummaryDayType;
};

export type LineSummary = {
  lineId: string;
  status: LineSummaryStatus;
  durationSecondsByIssueType: {
    [key in IssueType]?: number;
  };
  durationSecondsTotalForIssues: number;
  breakdownByDates: Record<string, LineSummaryDateRecord>;
  uptimeRatio: number | null;
  totalServiceSeconds: number | null;
  totalDowntimeSeconds: number | null;
  downtimeBreakdown: Array<{
    type: IssueType;
    downtimeSeconds: number;
  }> | null;
  uptimeRank: number | null;
  totalLines: number | null;
};

export type ChartEntry = {
  name: string;
  payload: Record<string, number>;
};

export type Granularity = 'day' | 'month' | 'year';

type TimeScale = {
  granularity: Granularity;
  count: number;
};

export type TimeScaleChart = {
  title: string;
  data: ChartEntry[];
  displayTimeScale?: TimeScale;
  dataTimeScale: TimeScale;
  dataCumulative: ChartEntry[];
};

type Chart = {
  title: string;
  data: ChartEntry[];
};

export type SystemAnalytics = {
  timeScaleChartsIssueCount: TimeScaleChart[];
  timeScaleChartsIssueDuration: TimeScaleChart[];
  chartTotalIssueCountByLine: Chart;
  chartTotalIssueCountByStation: Chart;
  chartRollingYearHeatmap: Chart;
  issueIdsDisruptionLongest: string[];
};

export type LineBranch = {
  id: string;
  title: string;
  titleTranslations: AppTranslations;
  startedAt: string | null;
  endedAt: string | null;
  stationIds: string[];
};

type OperatorLinePerformance = {
  lineId: string;
  status: LineSummaryStatus;
  uptimeRatio: number | null;
  issueCount: number;
};

export type OperatorProfile = {
  operatorId: string;
  lineIds: string[];
  aggregateUptimeRatio: number | null;
  currentOperationalStatus:
    | 'all_operational'
    | 'some_lines_disrupted'
    | 'some_lines_under_maintenance'
    | 'all_lines_closed_for_day';
  linesAffected: string[];
  totalIssuesByType: {
    [key in IssueType]?: number;
  };
  totalStationsOperated: number;
  issueIdsRecent: string[];
  timeScaleGraphsIssueCount: TimeScaleChart[];
  timeScaleGraphsUptimeRatios: TimeScaleChart[];
  linePerformanceComparison: OperatorLinePerformance[];
  totalDowntimeDurationSeconds: number;
  downtimeDurationByIssueType: {
    [key in IssueType]?: number;
  };
  yearsOfOperation: number | null;
};
