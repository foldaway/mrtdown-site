import type { IncludedEntities } from '~/types';
import { isRecord } from './shared';
import type { StatisticsSnapshotPayload, SystemAnalytics } from './types';

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
