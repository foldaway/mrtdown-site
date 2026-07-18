import { desc, eq, inArray } from 'drizzle-orm';
import {
  evidencesTable,
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  issuesTable,
  serviceRevisionPathStationEntriesTable,
  servicesTable,
  stationCodesTable,
} from '~/db/schema';
import { type AppDb, getDefaultDb, timeDbQuery } from './database';
import { buildDataset, type DatasetStaticScope } from './dataset';
import { selectIncludedEntities } from './includedEntities';

type IssueReferenceRows = {
  facilityRows: Array<
    Pick<
      typeof impactEventEntityFacilitiesTable.$inferSelect,
      'line_id' | 'station_id'
    >
  >;
  serviceRows: Array<
    Pick<typeof impactEventEntityServicesTable.$inferSelect, 'service_id'>
  >;
};

export function deriveIssueInitialScope(referenceRows: IssueReferenceRows) {
  return {
    lineIds: [
      ...new Set(
        referenceRows.facilityRows
          .map((row) => row.line_id)
          .filter((lineId): lineId is string => lineId != null),
      ),
    ],
    serviceIds: [
      ...new Set(referenceRows.serviceRows.map((row) => row.service_id)),
    ],
    stationIds: [
      ...new Set(referenceRows.facilityRows.map((row) => row.station_id)),
    ],
  };
}

async function getIssueStaticScope(
  issueId: string,
  db: AppDb,
): Promise<DatasetStaticScope> {
  const impactEventRows = await timeDbQuery('issue_q_impact_events', () =>
    db
      .select({ id: impactEventsTable.id })
      .from(impactEventsTable)
      .where(eq(impactEventsTable.issue_id, issueId)),
  );
  const impactEventIds = impactEventRows.map((row) => row.id);
  const [serviceReferenceRows, facilityReferenceRows] =
    impactEventIds.length > 0
      ? await Promise.all([
          timeDbQuery('issue_q_service_references', () =>
            db
              .select({
                service_id: impactEventEntityServicesTable.service_id,
              })
              .from(impactEventEntityServicesTable)
              .where(
                inArray(
                  impactEventEntityServicesTable.impact_event_id,
                  impactEventIds,
                ),
              ),
          ),
          timeDbQuery('issue_q_facility_references', () =>
            db
              .select({
                line_id: impactEventEntityFacilitiesTable.line_id,
                station_id: impactEventEntityFacilitiesTable.station_id,
              })
              .from(impactEventEntityFacilitiesTable)
              .where(
                inArray(
                  impactEventEntityFacilitiesTable.impact_event_id,
                  impactEventIds,
                ),
              ),
          ),
        ])
      : [[], []];
  const initialScope = deriveIssueInitialScope({
    facilityRows: facilityReferenceRows,
    serviceRows: serviceReferenceRows,
  });
  const referencedServiceRows =
    initialScope.serviceIds.length > 0
      ? await timeDbQuery('issue_q_referenced_services', () =>
          db
            .select({
              id: servicesTable.id,
              line_id: servicesTable.line_id,
            })
            .from(servicesTable)
            .where(inArray(servicesTable.id, initialScope.serviceIds)),
        )
      : [];
  const affectedLineIds = [
    ...new Set([
      ...initialScope.lineIds,
      ...referencedServiceRows.map((row) => row.line_id),
    ]),
  ];
  const affectedLineServiceRows =
    affectedLineIds.length > 0
      ? await timeDbQuery('issue_q_affected_line_services', () =>
          db
            .select({ id: servicesTable.id })
            .from(servicesTable)
            .where(inArray(servicesTable.line_id, affectedLineIds)),
        )
      : [];
  const affectedLineServiceIds = affectedLineServiceRows.map((row) => row.id);
  const affectedPathRows =
    affectedLineServiceIds.length > 0
      ? await timeDbQuery('issue_q_affected_service_paths', () =>
          db
            .select({
              station_id: serviceRevisionPathStationEntriesTable.station_id,
            })
            .from(serviceRevisionPathStationEntriesTable)
            .where(
              inArray(
                serviceRevisionPathStationEntriesTable.service_id,
                affectedLineServiceIds,
              ),
            ),
        )
      : [];
  const affectedStationIds = [
    ...new Set([
      ...initialScope.stationIds,
      ...affectedPathRows.map((row) => row.station_id),
    ]),
  ];
  const stationCodeRows =
    affectedStationIds.length > 0
      ? await timeDbQuery('issue_q_station_membership_lines', () =>
          db
            .select({ line_id: stationCodesTable.line_id })
            .from(stationCodesTable)
            .where(inArray(stationCodesTable.station_id, affectedStationIds)),
        )
      : [];
  const lineIds = [
    ...new Set([
      ...affectedLineIds,
      ...stationCodeRows.map((row) => row.line_id),
    ]),
  ];
  const serviceRows =
    lineIds.length > 0
      ? await timeDbQuery('issue_q_scoped_services', () =>
          db
            .select({ id: servicesTable.id })
            .from(servicesTable)
            .where(inArray(servicesTable.line_id, lineIds)),
        )
      : [];

  return {
    lineIds,
    serviceIds: serviceRows.map((row) => row.id),
    stationIds: affectedStationIds,
  };
}

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
    getIssueStaticScope(issueId, db),
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
