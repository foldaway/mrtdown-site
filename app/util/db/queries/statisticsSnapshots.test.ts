import { describe, expect, it } from 'vitest';
import { statisticsSnapshotsTable } from '~/db/schema';
import {
  getLatestStatisticsSnapshotFromDb,
  type StatisticsSnapshotDb,
} from './statisticsSnapshots';
import { createDbStub } from './testDbStub';
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

describe('getLatestStatisticsSnapshotFromDb', () => {
  it('fetches only the compact latest statistics snapshot payload', async () => {
    const statistics = buildStatistics();
    const included = {
      issues: {},
      lines: {},
      stations: {},
      operators: {},
      towns: {},
      landmarks: {},
    };
    const { calls, db, select } = createDbStub<StatisticsSnapshotDb>([
      {
        table: statisticsSnapshotsTable,
        rows: [
          {
            data: {
              kind: 'statistics_snapshot.v1',
              data: statistics,
              included,
            },
          },
        ],
        terminalMethod: 'limit',
      },
    ]);

    await expect(getLatestStatisticsSnapshotFromDb(db)).resolves.toEqual({
      data: statistics,
      included,
    });

    expect(select).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        selectionKeys: ['data'],
        table: statisticsSnapshotsTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 0,
        limitCalls: 1,
      },
    ]);
  });
});
