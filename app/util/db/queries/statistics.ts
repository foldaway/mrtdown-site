import type { IncludedEntities } from '~/types';
import {
  recordServerTiming,
  timeServerSpan,
  timeSyncServerSpan,
} from '~/util/serverTiming';
import { buildDataset, getBaseDataset } from './baseDataset';
import {
  buildStatisticsDataFromDataset,
  getStatisticsIncluded,
} from './legacy';
export { isMissingTableError } from './shared';
export {
  getLatestStatisticsSnapshot,
  getLatestStatisticsSnapshotFromDb,
  STATISTICS_SNAPSHOT_ID,
} from './statisticsSnapshots';
import { getLatestStatisticsSnapshot } from './statisticsSnapshots';
export { parseStatisticsSnapshotPayload } from './statisticsPayload';
import { nowSg } from './temporal';
export type { SystemAnalytics } from './types';
import type { SystemAnalytics } from './types';

type StatisticsSnapshotResult = {
  data: SystemAnalytics;
  included: IncludedEntities | null;
};

export type StatisticsDataOptions = {
  requireSnapshot?: boolean;
};

export class StatisticsSnapshotUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatisticsSnapshotUnavailableError';
  }
}

export function shouldRequireStatisticsSnapshot(
  options: StatisticsDataOptions = {},
) {
  return options.requireSnapshot ?? import.meta.env.PROD;
}

export function assertStatisticsSnapshotReady(
  snapshot: StatisticsSnapshotResult | null,
) {
  if (snapshot == null) {
    throw new StatisticsSnapshotUnavailableError(
      'Statistics snapshot is required in production but no current snapshot was found.',
    );
  }

  if (snapshot.included == null) {
    throw new StatisticsSnapshotUnavailableError(
      'Statistics snapshot is required in production but the latest snapshot does not include precomputed entities.',
    );
  }
}

export async function getStatisticsData(options: StatisticsDataOptions = {}) {
  return timeServerSpan('statistics_data', async () => {
    const snapshot = await getLatestStatisticsSnapshot();
    if (shouldRequireStatisticsSnapshot(options)) {
      assertStatisticsSnapshotReady(snapshot);
    }

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
