import { describe, expect, it } from 'vitest';
import type { LineSummary } from '~/types';
import { sortLineSummariesWithFutureServiceLast } from './sortLineSummaries';

const lineSummary = (
  lineId: string,
  status: LineSummary['status'],
): LineSummary => {
  return {
    lineId,
    status,
    durationSecondsByIssueType: {},
    durationSecondsTotalForIssues: 0,
    breakdownByDates: {},
    uptimeRatio: 1,
    totalServiceSeconds: 0,
    totalDowntimeSeconds: 0,
    downtimeBreakdown: [],
    uptimeRank: null,
    totalLines: null,
  };
};

describe('sortLineSummariesWithFutureServiceLast', () => {
  it('moves future service entries to the end', () => {
    const input: LineSummary[] = [
      lineSummary('A', 'future_service'),
      lineSummary('B', 'normal'),
      lineSummary('C', 'ongoing_maintenance'),
      lineSummary('D', 'future_service'),
      lineSummary('E', 'ongoing_disruption'),
    ];

    const sorted = sortLineSummariesWithFutureServiceLast(input);

    expect(sorted.map((summary) => summary.lineId)).toEqual([
      'B',
      'C',
      'E',
      'A',
      'D',
    ]);
  });

  it('does not mutate the input array', () => {
    const input: LineSummary[] = [
      lineSummary('A', 'future_service'),
      lineSummary('B', 'normal'),
    ];

    sortLineSummariesWithFutureServiceLast(input);

    expect(input.map((summary) => summary.lineId)).toEqual(['A', 'B']);
  });
});
