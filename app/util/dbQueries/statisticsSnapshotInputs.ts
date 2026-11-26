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
  // Binds the SQL projection to completed canonical publication.
  generation?: string;
  data: SystemAnalytics;
  included: IncludedEntities;
};

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

export function assertCompleteStatisticsSnapshot(
  snapshot: ReturnType<typeof parseStatisticsSnapshotPayload>,
): asserts snapshot is {
  data: SystemAnalytics;
  included: IncludedEntities;
} {
  if (snapshot?.included == null) {
    throw new Error(
      'Statistics snapshot is missing or incomplete. Apply database migrations, then run the canonical data pull or POST /internal/api/tasks/facts before serving /statistics.',
    );
  }
}
