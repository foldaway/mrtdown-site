import { desc, eq } from 'drizzle-orm';
import { evidencesTable, issuesTable } from '~/db/schema';
import { getDefaultDb, timeDbQuery } from './database';
import { buildDataset } from './dataset';
import { selectIncludedEntities } from './includedEntities';
import { getIssueStaticScope } from './readModelScope';

export { deriveIssueInitialScope } from './readModelScope';

export async function getIssueReadModel(issueId: string) {
  const db = await getDefaultDb();
  const [issueRow] = await timeDbQuery('issue_q_root', () =>
    db
      .select({ id: issuesTable.id })
      .from(issuesTable)
      .where(eq(issuesTable.id, issueId))
      .limit(1),
  );
  if (issueRow == null) {
    throw new Response('Issue not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const [staticScope, evidenceRows] = await Promise.all([
    getIssueStaticScope([issueId], db, 'issue'),
    timeDbQuery('issue_q_evidence', () =>
      db
        .select()
        .from(evidencesTable)
        .where(eq(evidencesTable.issue_id, issueId))
        .orderBy(desc(evidencesTable.ts)),
    ),
  ]);
  const dataset = await buildDataset(undefined, db, [issueId], staticScope);
  const issue = dataset.allIssues[issueId];
  if (issue == null) {
    throw new Error(
      `Issue ${issueId} disappeared while building its read model`,
    );
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

/** @deprecated Use the explicitly scoped read-model name. */
export const getIssueData = getIssueReadModel;
