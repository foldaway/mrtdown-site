import { asc, desc, eq } from 'drizzle-orm';
import { evidencesTable, issuesTable } from '~/db/schema';
import { type AppDbReader, getDefaultDb, timeDbQuery } from './database';
import { buildDataset } from './dataset';
import { nowSg } from './dateTime';
import { assembleIssueProfile } from './issueProfileSnapshotInputs';
import { toIssueUpdate } from './issueEvidence';
import { getIssueStaticScope } from './readModelScope';

export { deriveIssueInitialScope } from './readModelScope';

export async function getIssueReadModel(
  issueId: string,
  referenceNow = nowSg(),
  reader?: AppDbReader,
) {
  const db = reader ?? (await getDefaultDb());
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
        .orderBy(desc(evidencesTable.ts), asc(evidencesTable.id)),
    ),
  ]);
  const dataset = await buildDataset(referenceNow, db, [issueId], staticScope);
  return assembleIssueProfile(
    issueId,
    dataset,
    evidenceRows.map(toIssueUpdate),
  );
}

/** @deprecated Use the explicitly scoped read-model name. */
export const getIssueData = getIssueReadModel;
