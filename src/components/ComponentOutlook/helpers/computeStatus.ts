import type { IssueType } from '../../../types';

const ISSUE_TYPE_PRIORITY: IssueType[] = ['disruption', 'maintenance', 'infra'];

export function computeStatus(
  issueTypesDurationMs: Partial<Record<IssueType, number>>,
) {
  for (const issueType of ISSUE_TYPE_PRIORITY) {
    if (issueType in issueTypesDurationMs) {
      return issueType;
    }
  }
  return null;
}
