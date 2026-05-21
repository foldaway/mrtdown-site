import type {
  CauseSubtype,
  Issue as CoreIssue,
  IssueType,
  Landmark as CoreLandmark,
  Line as CoreLine,
  Operator as CoreOperator,
  Station as CoreStation,
  Town as CoreTown,
} from '@mrtdown/core';

type StationCode = CoreStation['stationCodes'][number];

export type Line = Omit<CoreLine, 'serviceIds' | 'operatingHours'> & {
  operatingHours: NonNullable<CoreLine['operatingHours']>;
};

type StationLineMembership = Pick<
  StationCode,
  'lineId' | 'code' | 'startedAt' | 'structureType'
> & {
  branchId: string;
  endedAt?: NonNullable<StationCode['endedAt']>;
  sequenceOrder: number;
};

export type Station = Omit<CoreStation, 'stationCodes'> & {
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

export type Issue = Omit<CoreIssue, 'titleMeta'> & {
  subtypes: CauseSubtype[];
  durationSeconds: number;
  lineIds: string[];
  branchesAffected: IssueAffectedBranch[];
  intervals: IssueInterval[];
};

export type IncludedEntities = {
  lines: Record<string, Line>;
  stations: Record<string, Station>;
  issues: Record<string, Issue>;
  landmarks: Record<string, CoreLandmark>;
  towns: Record<string, CoreTown>;
  operators: Record<string, CoreOperator>;
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
