import { describe, expect, it } from 'vitest';
import {
  StatisticsSnapshotUnavailableError,
  assertStatisticsSnapshotReady,
  shouldRequireStatisticsSnapshot,
} from './statistics';
import type { SystemAnalytics } from './types';

function buildStatistics(): SystemAnalytics {
  return {
    timeScaleChartsIssueCount: [],
    timeScaleChartsIssueDuration: [],
    chartTotalIssueCountByLine: {
      title: 'Issue Count by Line',
      data: [],
    },
    chartTotalIssueCountByStation: {
      title: 'Issue Count by Station',
      data: [],
    },
    chartRollingYearHeatmap: {
      title: 'Rolling Year Heatmap',
      data: [],
    },
    issueIdsDisruptionLongest: ['disruption-1'],
  };
}

describe('shouldRequireStatisticsSnapshot', () => {
  it('allows callers to require snapshot-backed statistics explicitly', () => {
    expect(shouldRequireStatisticsSnapshot({ requireSnapshot: true })).toBe(
      true,
    );
    expect(shouldRequireStatisticsSnapshot({ requireSnapshot: false })).toBe(
      false,
    );
  });
});

describe('assertStatisticsSnapshotReady', () => {
  it('accepts snapshots with precomputed included entities', () => {
    expect(() =>
      assertStatisticsSnapshotReady({
        data: buildStatistics(),
        included: {
          issues: {},
          lines: {},
          stations: {},
          operators: {},
          towns: {},
          landmarks: {},
        },
      }),
    ).not.toThrow();
  });

  it('rejects missing snapshots', () => {
    expect(() => assertStatisticsSnapshotReady(null)).toThrow(
      StatisticsSnapshotUnavailableError,
    );
  });

  it('rejects legacy snapshots without included entities', () => {
    expect(() =>
      assertStatisticsSnapshotReady({
        data: buildStatistics(),
        included: null,
      }),
    ).toThrow(StatisticsSnapshotUnavailableError);
  });
});
