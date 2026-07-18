import { inArray } from 'drizzle-orm';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  serviceRevisionPathStationEntriesTable,
  servicesTable,
  stationCodesTable,
} from '~/db/schema';
import { type AppDb, timeDbQuery } from './database';
import type { DatasetStaticScope } from './dataset';

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

export async function getIssueStaticScope(
  issueIds: readonly string[],
  db: AppDb,
  queryPrefix:
    | 'issue'
    | 'line_profile'
    | 'operator_profile'
    | 'station_profile'
    | 'town_profile',
): Promise<DatasetStaticScope> {
  const uniqueIssueIds = [...new Set(issueIds)];
  if (uniqueIssueIds.length === 0) {
    return { lineIds: [], serviceIds: [], stationIds: [] };
  }

  const impactEventRows = await timeDbQuery(
    `${queryPrefix}_q_impact_events`,
    () =>
      db
        .select({ id: impactEventsTable.id })
        .from(impactEventsTable)
        .where(inArray(impactEventsTable.issue_id, uniqueIssueIds)),
  );
  const impactEventIds = impactEventRows.map((row) => row.id);
  const [serviceReferenceRows, facilityReferenceRows] =
    impactEventIds.length > 0
      ? await Promise.all([
          timeDbQuery(`${queryPrefix}_q_service_references`, () =>
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
          timeDbQuery(`${queryPrefix}_q_facility_references`, () =>
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
      ? await timeDbQuery(`${queryPrefix}_q_referenced_services`, () =>
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
      ? await timeDbQuery(`${queryPrefix}_q_affected_line_services`, () =>
          db
            .select({ id: servicesTable.id })
            .from(servicesTable)
            .where(inArray(servicesTable.line_id, affectedLineIds)),
        )
      : [];
  const affectedLineServiceIds = affectedLineServiceRows.map((row) => row.id);
  const affectedPathRows =
    affectedLineServiceIds.length > 0
      ? await timeDbQuery(`${queryPrefix}_q_affected_service_paths`, () =>
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
      ? await timeDbQuery(`${queryPrefix}_q_station_membership_lines`, () =>
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
      ? await timeDbQuery(`${queryPrefix}_q_scoped_services`, () =>
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
