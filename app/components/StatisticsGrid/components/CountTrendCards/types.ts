import type { IssueType } from '../../../../types';

export interface DataPartial {
  bucketLabel: string;
  issueIdsByIssueType: Record<IssueType, Set<string>>;
}

export interface Data {
  bucketLabel: string;
  countByIssueType: Record<IssueType, number>;
}
