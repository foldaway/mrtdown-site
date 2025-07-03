import type { IssueRef, IssueType } from '../../../types';

const ISSUE_TYPE_PRIORITY: IssueType[] = ['disruption', 'maintenance', 'infra'];

export function computeStatus(issuesOngoing: IssueRef[]) {
  const issueTypes = new Set<IssueType>();
  for (const issue of issuesOngoing) {
    issueTypes.add(issue.type);
  }
  for (const issueType of ISSUE_TYPE_PRIORITY) {
    if (issueTypes.has(issueType)) {
      return issueType;
    }
  }
  return null;
}
