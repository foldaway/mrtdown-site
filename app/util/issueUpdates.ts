import type { Evidence, EvidenceRender } from '@mrtdown/core';

export type IssueUpdateLocale = keyof EvidenceRender['text'];

export const ISSUE_UPDATE_LOCALES = [
  'en-SG',
  'zh-Hans',
  'ms',
  'ta',
] satisfies IssueUpdateLocale[];

export type LocalizedIssueUpdate = {
  type: Evidence['type'];
  text: Evidence['text'];
  sourceUrl: Evidence['sourceUrl'];
  createdAt: Evidence['ts'];
  textTranslations: EvidenceRender['text'] | null;
};

export function isIssueUpdateLocale(
  locale: string,
): locale is IssueUpdateLocale {
  return ISSUE_UPDATE_LOCALES.includes(locale as IssueUpdateLocale);
}
