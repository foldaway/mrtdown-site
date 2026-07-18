import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { BaseDataset } from './dataset';
import {
  buildLineOperationalFactRows,
  buildStationIssueFactRows,
} from './operationalFacts';
import { buildIssue, REFERENCE_NOW, TEST_LINE } from './testFixtures';

describe('buildLineOperationalFactRows', () => {
  it('stores each issue interval clipped to the line service window', () => {
    const facts = buildLineOperationalFactRows(
      TEST_LINE,
      [
        buildIssue('infra-1', 'infra', [
          {
            startAt: '2026-02-23T00:00:00+08:00',
            endAt: '2026-02-24T00:00:00+08:00',
            status: 'ended',
          },
        ]),
        buildIssue('disruption-1', 'disruption', [
          {
            startAt: '2026-02-23T12:00:00+08:00',
            endAt: '2026-02-23T16:00:00+08:00',
            status: 'ended',
          },
        ]),
      ],
      DateTime.fromISO('2026-02-23', { zone: 'Asia/Singapore' }),
      new Set(),
      REFERENCE_NOW,
    );

    expect(facts.intervalRows).toMatchObject([
      {
        date: '2026-02-23',
        line_id: 'BPLRT',
        issue_id: 'infra-1',
        interval_index: 0,
        issue_type: 'infra',
        start_at: '2026-02-23T05:30:00.000+08:00',
        end_at: '2026-02-23T23:30:00.000+08:00',
      },
      {
        date: '2026-02-23',
        line_id: 'BPLRT',
        issue_id: 'disruption-1',
        interval_index: 0,
        issue_type: 'disruption',
        start_at: '2026-02-23T12:00:00.000+08:00',
        end_at: '2026-02-23T16:00:00.000+08:00',
      },
    ]);
  });
});

describe('buildStationIssueFactRows', () => {
  it('projects exact station associations and latest issue activity', () => {
    const issue = {
      ...buildIssue('disruption-1', 'disruption', [
        {
          startAt: '2026-02-20T10:00:00+08:00',
          endAt: '2026-02-20T11:00:00+08:00',
          status: 'ended',
        },
        {
          startAt: '2026-02-23T12:00:00+08:00',
          endAt: '2026-02-23T16:00:00+08:00',
          status: 'ended',
        },
      ]),
      branchesAffected: [
        {
          lineId: TEST_LINE.id,
          branchId: TEST_LINE.id,
          stationIds: ['BP6', 'BP7', 'BP6'],
        },
      ],
    };
    const dataset = {
      allIssues: { [issue.id]: issue },
    } as BaseDataset;

    expect(buildStationIssueFactRows(dataset, REFERENCE_NOW)).toEqual([
      {
        station_id: 'BP6',
        issue_id: 'disruption-1',
        issue_type: 'disruption',
        latest_activity_at: '2026-02-23T16:00:00+08:00',
        as_of: '2026-02-23T23:59:00.000+08:00',
      },
      {
        station_id: 'BP7',
        issue_id: 'disruption-1',
        issue_type: 'disruption',
        latest_activity_at: '2026-02-23T16:00:00+08:00',
        as_of: '2026-02-23T23:59:00.000+08:00',
      },
    ]);
  });

  it('omits issues without an operational interval', () => {
    const issue = {
      ...buildIssue('disruption-1', 'disruption', []),
      branchesAffected: [
        {
          lineId: TEST_LINE.id,
          branchId: TEST_LINE.id,
          stationIds: ['BP6'],
        },
      ],
    };

    expect(
      buildStationIssueFactRows(
        { allIssues: { [issue.id]: issue } } as BaseDataset,
        REFERENCE_NOW,
      ),
    ).toEqual([]);
  });
});
