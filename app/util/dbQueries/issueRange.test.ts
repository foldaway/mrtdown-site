import { describe, expect, it } from 'vitest';
import { selectIssueIdsWithLatestOverlappingPeriodEvents } from './issueRange';

describe('history issue range selection', () => {
  it('keeps an issue when its latest period revision overlaps the range', () => {
    expect(
      selectIssueIdsWithLatestOverlappingPeriodEvents(
        ['periods-latest'],
        [
          {
            id: 'periods-old',
            issue_id: 'issue-1',
            ts: '2025-01-01T00:00:00+08:00',
          },
          {
            id: 'periods-latest',
            issue_id: 'issue-1',
            ts: '2025-01-02T00:00:00+08:00',
          },
        ],
      ),
    ).toEqual(['issue-1']);
  });

  it('rejects stale overlapping periods superseded by a newer revision', () => {
    expect(
      selectIssueIdsWithLatestOverlappingPeriodEvents(
        ['periods-old'],
        [
          {
            id: 'periods-old',
            issue_id: 'issue-1',
            ts: '2025-01-01T00:00:00+08:00',
          },
          {
            id: 'periods-latest',
            issue_id: 'issue-1',
            ts: '2025-01-02T00:00:00+08:00',
          },
        ],
      ),
    ).toEqual([]);
  });

  it('uses event ids as a deterministic timestamp tie-breaker', () => {
    expect(
      selectIssueIdsWithLatestOverlappingPeriodEvents(
        ['periods-b'],
        [
          {
            id: 'periods-a',
            issue_id: 'issue-1',
            ts: '2025-01-01T00:00:00+08:00',
          },
          {
            id: 'periods-b',
            issue_id: 'issue-1',
            ts: '2025-01-01T00:00:00+08:00',
          },
        ],
      ),
    ).toEqual(['issue-1']);
  });
});
