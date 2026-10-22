import { nonPublicEvidenceRedactedText } from '@mrtdown/fs';
import type { evidencesTable } from '~/db/schema';

type IssueEvidenceRow = Pick<
  typeof evidencesTable.$inferSelect,
  'type' | 'text' | 'render' | 'source_url' | 'ts'
>;

export function toIssueUpdate(evidence: IssueEvidenceRow) {
  const isTextRedacted = evidence.text === nonPublicEvidenceRedactedText;
  return {
    type: evidence.type,
    // Export placeholders describe storage policy, not the service update.
    // Keep that distinction explicit for HTML and Markdown presentation.
    text: isTextRedacted ? '' : evidence.text,
    textTranslations: isTextRedacted ? null : (evidence.render?.text ?? null),
    isTextRedacted,
    sourceUrl: evidence.source_url,
    createdAt: evidence.ts,
  };
}
