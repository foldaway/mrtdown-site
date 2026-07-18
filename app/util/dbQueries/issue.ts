import { desc, eq } from 'drizzle-orm';
import { evidencesTable } from '~/db/schema';
import { getDefaultDb } from './database';
import { getCompleteDataset } from './dataset';
import { selectIncludedEntities } from './includedEntities';

export async function getIssueData(issueId: string) {
  const db = await getDefaultDb();
  const [dataset, evidenceRows] = await Promise.all([
    getCompleteDataset('route:/issues/:issueId'),
    db
      .select()
      .from(evidencesTable)
      .where(eq(evidencesTable.issue_id, issueId))
      .orderBy(desc(evidencesTable.ts)),
  ]);
  const issue = dataset.allIssues[issueId];
  if (issue == null) {
    throw new Response('Issue not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  return {
    data: {
      id: issueId,
      updates: evidenceRows.map((evidence) => ({
        type: evidence.type,
        text: evidence.text,
        textTranslations: evidence.render?.text ?? null,
        sourceUrl: evidence.source_url,
        createdAt: evidence.ts,
      })),
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: [issueId],
      includeStationMembershipLines: true,
    }),
  };
}
