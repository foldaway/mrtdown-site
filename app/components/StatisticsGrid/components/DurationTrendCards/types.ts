import type { IssueType } from '../../../../types';

export interface Data {
  bucketLabel: string;
  durationMsByIssueType: Record<IssueType, number>;
}
