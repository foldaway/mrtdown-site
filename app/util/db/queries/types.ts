import type {
  FacilityEffectKind,
  Service as CoreService,
  ServiceEffectKind,
} from '@mrtdown/core';
import type {
  ChartEntry,
  IncludedEntities,
  Issue,
  LineSummaryStatus,
  TimeScaleChart,
} from '~/types';

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

export type StatisticsSnapshotPayload = {
  kind: 'statistics_snapshot.v1';
  data: SystemAnalytics;
  included: IncludedEntities;
};

export type BaseIncludedEntities = Omit<IncludedEntities, 'issues'>;

export type DatasetLineBranch = {
  id: CoreService['id'];
  name: CoreService['name'];
  startedAt: CoreService['revisions'][number]['startAt'] | null;
  endedAt: CoreService['revisions'][number]['endAt'];
  stationIds: Array<
    CoreService['revisions'][number]['path']['stations'][number]['stationId']
  >;
};

export type OperatorOperationalStatus =
  | 'all_operational'
  | 'some_lines_disrupted'
  | 'some_lines_under_maintenance'
  | 'all_lines_closed_for_day';

export type OperatorLinePerformance = {
  lineId: string;
  status: LineSummaryStatus;
  uptimeRatio: number | null;
  issueCount: number;
};

export type IssueWithOperationalEffects = Issue & {
  serviceEffectKinds: ServiceEffectKind[];
  facilityEffectKinds: FacilityEffectKind[];
};

export type BranchWithEntries = DatasetLineBranch & {
  entries: Array<{
    stationId: string;
    displayCode: string;
    pathIndex: number;
  }>;
};

export type CommunitySignalOptions = {
  includeCommunitySignals?: boolean;
};

export type BaseDataset = {
  included: BaseIncludedEntities;
  branchesByLineId: Record<string, BranchWithEntries[]>;
  branchByServiceId: Record<string, BranchWithEntries>;
  metadata: Record<string, string>;
  publicHolidaySet: Set<string>;
  allIssues: Record<string, IssueWithOperationalEffects>;
  issuesByLineId: Record<string, IssueWithOperationalEffects[]>;
};

export type OverviewDataset = Pick<
  BaseDataset,
  'included' | 'publicHolidaySet' | 'allIssues' | 'issuesByLineId'
>;
