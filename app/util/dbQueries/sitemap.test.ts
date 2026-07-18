import { describe, expect, it } from 'vitest';
import {
  buildSitemapDataFromDataset,
  parseSitemapSnapshotPayload,
  requireSitemapSnapshot,
} from './sitemap';
import { buildIssue } from './testFixtures';

const sitemapData = {
  lineIds: ['EWL'],
  stationIds: ['EW1'],
  townIds: ['pasir-ris'],
  operatorIds: ['smrt'],
  issueIds: ['issue-1'],
  monthEarliest: '2025-01-01',
  monthLatest: '2026-07-01',
  currentDate: '2026-07-18',
};

describe('parseSitemapSnapshotPayload', () => {
  it('reads the persisted sitemap projection', () => {
    expect(
      parseSitemapSnapshotPayload({
        kind: 'sitemap_snapshot.v1',
        data: sitemapData,
      }),
    ).toEqual(sitemapData);
  });

  it('rejects malformed and unversioned projections', () => {
    expect(parseSitemapSnapshotPayload(sitemapData)).toBeNull();
    expect(
      parseSitemapSnapshotPayload({
        kind: 'sitemap_snapshot.v1',
        data: { ...sitemapData, issueIds: [123] },
      }),
    ).toBeNull();
  });

  it('throws rebuild instructions when the persisted projection is missing', () => {
    expect(() => requireSitemapSnapshot(null)).toThrow(
      'Apply database migrations, then run the canonical data pull or POST /internal/api/tasks/facts',
    );
    expect(requireSitemapSnapshot(sitemapData)).toEqual(sitemapData);
  });
});

describe('buildSitemapDataFromDataset', () => {
  it('preserves entity IDs, issue eligibility, and history month bounds', () => {
    const earlyIssue = buildIssue('issue-early', 'disruption', [
      {
        startAt: '2025-01-15T12:00:00+08:00',
        endAt: '2025-01-15T13:00:00+08:00',
        status: 'ended',
      },
    ]);
    const lateIssue = buildIssue('issue-late', 'maintenance', [
      {
        startAt: '2026-06-30T23:00:00+08:00',
        endAt: '2026-07-01T01:00:00+08:00',
        status: 'ended',
      },
    ]);
    const issueWithoutIntervals = buildIssue('issue-empty', 'infra', []);
    const dataset = {
      included: {
        lines: { Z: { id: 'Z' }, A: { id: 'A' } },
        stations: { S2: { id: 'S2' }, S1: { id: 'S1' } },
        towns: { T1: { id: 'T1' } },
        operators: { O1: { id: 'O1' } },
        landmarks: {},
      },
      allIssues: {
        [lateIssue.id]: lateIssue,
        [issueWithoutIntervals.id]: issueWithoutIntervals,
        [earlyIssue.id]: earlyIssue,
      },
    };

    expect(buildSitemapDataFromDataset(dataset)).toMatchObject({
      lineIds: ['A', 'Z'],
      stationIds: ['S1', 'S2'],
      townIds: ['T1'],
      operatorIds: ['O1'],
      issueIds: ['issue-late', 'issue-early'],
      monthEarliest: '2025-01-01',
      monthLatest: '2026-06-01',
    });
  });
});
