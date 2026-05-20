import type { IssueUpdate } from '~/client';

export type LocalizedIssueUpdate = IssueUpdate & {
  textTranslations: Record<string, string | null> | null;
};
