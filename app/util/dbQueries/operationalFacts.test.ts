import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { buildLineOperationalFactRows } from './operationalFacts';
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
