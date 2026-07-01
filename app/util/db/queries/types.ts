import type { ChartEntry, IncludedEntities, TimeScaleChart } from '~/types';

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
