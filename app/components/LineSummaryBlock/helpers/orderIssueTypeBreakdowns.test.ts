import { describe, expect, it } from 'vitest';
import type { LineSummaryDateRecord } from '~/types';
import { getOrderedIssueTypeBreakdowns } from './orderIssueTypeBreakdowns';

describe('getOrderedIssueTypeBreakdowns', () => {
  it('orders issue breakdowns by display priority instead of insertion order', () => {
    const breakdownByIssueTypes = {
      infra: { totalDurationSeconds: 120, issueIds: ['infra-1'] },
      disruption: { totalDurationSeconds: 30, issueIds: ['disruption-1'] },
      maintenance: { totalDurationSeconds: 60, issueIds: ['maintenance-1'] },
    } satisfies LineSummaryDateRecord['breakdownByIssueTypes'];

    expect(
      getOrderedIssueTypeBreakdowns(breakdownByIssueTypes).map(
        ([issueType]) => issueType,
      ),
    ).toEqual(['disruption', 'maintenance', 'infra']);
  });

  it('skips issue types that are not present', () => {
    const breakdownByIssueTypes = {
      infra: { totalDurationSeconds: 120, issueIds: ['infra-1'] },
    } satisfies LineSummaryDateRecord['breakdownByIssueTypes'];

    expect(getOrderedIssueTypeBreakdowns(breakdownByIssueTypes)).toEqual([
      ['infra', breakdownByIssueTypes.infra],
    ]);
  });
});
