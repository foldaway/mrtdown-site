import { eq, inArray } from 'drizzle-orm';
import {
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventsTable,
  serviceRevisionPathStationEntriesTable,
  servicesTable,
  stationCodesTable,
} from '~/db/schema';
import { type AppDbReader, timeDbQuery, timeDbRowsQuery } from './database';
import type { DatasetInputs, DatasetStaticScope } from './dataset';

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

/** Expand historical issue references against a completed published topology. */
export function getIssueScopeFromInputs(
  rows: DatasetInputs,
  issueIds: ReadonlySet<string>,
): DatasetStaticScope {
  const eventIds = new Set(
    rows.impactEventRows
      .filter((row) => issueIds.has(row.issue_id))
      .map((row) => row.id),
  );
  const initial = deriveIssueInitialScope({
    facilityRows: rows.impactEventFacilityRows.filter((row) =>
      eventIds.has(row.impact_event_id),
    ),
    serviceRows: rows.impactEventServiceRows.filter((row) =>
      eventIds.has(row.impact_event_id),
    ),
  });
  const affectedLines = new Set([
    ...initial.lineIds,
    ...rows.serviceRows
      .filter((row) => initial.serviceIds.includes(row.id))
      .map((row) => row.line_id),
  ]);
  const affectedServices = new Set(
    rows.serviceRows
      .filter((row) => affectedLines.has(row.line_id))
      .map((row) => row.id),
  );
  const stationIds = new Set([
    ...initial.stationIds,
    ...rows.servicePathRows
      .filter((row) => affectedServices.has(row.service_id))
      .map((row) => row.station_id),
  ]);
  const lineIds = new Set([
    ...affectedLines,
    ...rows.stationCodesRows
      .filter((row) => stationIds.has(row.station_id))
      .map((row) => row.line_id),
  ]);
  return {
    lineIds: [...lineIds],
    serviceIds: rows.serviceRows
      .filter((row) => lineIds.has(row.line_id))
      .map((row) => row.id),
    stationIds: [...stationIds],
    completeLineIds: [...lineIds],
  };
}

export async function getIssueStaticScope(
  issueIds: readonly string[],
  db: AppDbReader,
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

  const [serviceReferenceRows, facilityReferenceRows] = await Promise.all([
    timeDbRowsQuery(`${queryPrefix}_q_service_references`, () =>
      db
        .selectDistinct({
          service_id: impactEventEntityServicesTable.service_id,
        })
        .from(impactEventEntityServicesTable)
        .innerJoin(
          impactEventsTable,
          eq(
            impactEventEntityServicesTable.impact_event_id,
            impactEventsTable.id,
          ),
        )
        .where(inArray(impactEventsTable.issue_id, uniqueIssueIds)),
    ),
    timeDbRowsQuery(`${queryPrefix}_q_facility_references`, () =>
      db
        .selectDistinct({
          line_id: impactEventEntityFacilitiesTable.line_id,
          station_id: impactEventEntityFacilitiesTable.station_id,
        })
        .from(impactEventEntityFacilitiesTable)
        .innerJoin(
          impactEventsTable,
          eq(
            impactEventEntityFacilitiesTable.impact_event_id,
            impactEventsTable.id,
          ),
        )
        .where(inArray(impactEventsTable.issue_id, uniqueIssueIds)),
    ),
  ]);
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
      ? await timeDbRowsQuery(`${queryPrefix}_q_affected_service_paths`, () =>
          db
            .selectDistinct({
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
    completeLineIds: lineIds,
  };
}
