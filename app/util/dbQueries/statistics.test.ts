import { describe, expect, it } from 'vitest';
import { parseStatisticsSnapshotPayload } from './statistics';
import { buildStatistics } from './testFixtures';

describe('parseStatisticsSnapshotPayload', () => {
  it('reads precomputed statistics snapshots with included entities', () => {
    const statistics = buildStatistics();
    const included = {
      issues: {},
      lines: {},
      stations: {},
      operators: {},
      towns: {},
      landmarks: {},
    };

    expect(
      parseStatisticsSnapshotPayload({
        kind: 'statistics_snapshot.v1',
        data: statistics,
        included,
      }),
    ).toEqual({
      data: statistics,
      included,
    });
  });

  it('keeps legacy statistics-only snapshots as a fallback', () => {
    const statistics = buildStatistics();

    expect(parseStatisticsSnapshotPayload(statistics)).toEqual({
      data: statistics,
      included: null,
    });
  });

  it('rejects malformed statistics snapshot payloads', () => {
    expect(
      parseStatisticsSnapshotPayload({
        kind: 'statistics_snapshot.v1',
        data: buildStatistics(),
      }),
    ).toBeNull();
    expect(parseStatisticsSnapshotPayload({})).toBeNull();
  });
});
