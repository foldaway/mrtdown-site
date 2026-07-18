import { describe, expect, it } from 'vitest';
import {
  assertCompleteStatisticsSnapshot,
  parseStatisticsSnapshotPayload,
} from './statistics';
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

  it('recognizes legacy statistics-only snapshots as incomplete', () => {
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

  it('throws rebuild instructions when the snapshot is missing or incomplete', () => {
    expect(() => assertCompleteStatisticsSnapshot(null)).toThrow(
      'Apply database migrations, then run the canonical data pull or POST /internal/api/tasks/facts',
    );
    expect(() =>
      assertCompleteStatisticsSnapshot({
        data: buildStatistics(),
        included: null,
      }),
    ).toThrow('before serving /statistics');
  });
});
