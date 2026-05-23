import type { IssueType } from '@mrtdown/core';
import type { LineSummaryDateRecord } from '~/types';

type IssueTypeBreakdown = NonNullable<
  LineSummaryDateRecord['breakdownByIssueTypes'][IssueType]
>;

export type OrderedIssueTypeBreakdown = readonly [
  IssueType,
  IssueTypeBreakdown,
];

export const LINE_SUMMARY_ISSUE_TYPE_ORDER = [
  'disruption',
  'maintenance',
  'infra',
] as const satisfies readonly IssueType[];

export function getOrderedIssueTypeBreakdowns(
  breakdownByIssueTypes: LineSummaryDateRecord['breakdownByIssueTypes'],
): OrderedIssueTypeBreakdown[] {
  const entries: OrderedIssueTypeBreakdown[] = [];

  for (const issueType of LINE_SUMMARY_ISSUE_TYPE_ORDER) {
    const breakdown = breakdownByIssueTypes[issueType];
    if (breakdown != null) {
      entries.push([issueType, breakdown]);
    }
  }

  return entries;
}
