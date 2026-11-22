import { asc, inArray } from 'drizzle-orm';
import { readCanonicalTopologyAttestation } from '~/db/canonicalTopologyPromotion';
import {
  scheduledDepartureDaysTable as days,
  scheduledDepartureProjectionsTable as projections,
  scheduledDepartureScopesTable as scopes,
} from '~/db/scheduledDepartures.schema';
import { scheduledTimetablesTable as timetables } from '~/db/scheduledTimetables.schema';
import { servicesTable, stationsTable } from '~/db/schema';
import {
  MAX_ARRIVAL_DAY_ROWS,
  MAX_ARRIVAL_SCOPE_ROWS,
  MAX_ARRIVAL_VERSIONS,
  parseArrivalInputs,
} from './arrivalInputs';
import type { AppDbTransaction } from './database';
import { parseTranslations } from './dataset';
import {
  COMBINED_DEPARTURE_PROJECTOR_VERSION,
  SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
} from './projectScheduledTimetable';
import { readLiveScheduleTopology } from './readLiveScheduleTopology';
import { scheduledTimetableHistoryColumns } from './scheduledTimetableHistory';

/** The caller owns the completed generation's repeatable-read transaction. */
export async function readArrivalInputs(tx: AppDbTransaction) {
  const { attestation } = await readCanonicalTopologyAttestation(tx);
  if (!attestation)
    throw new Error('Arrival inputs require an attested canonical topology');
  const topology = await readLiveScheduleTopology(tx);
  const history = await tx
    .select(scheduledTimetableHistoryColumns)
    .from(timetables)
    .orderBy(asc(timetables.manifest_sha256))
    .limit(MAX_ARRIVAL_VERSIONS + 1);
  const indexed = await tx
    .select({
      id: projections.id,
      manifestSha256: projections.manifest_sha256,
      projectorVersion: projections.projector_version,
      topologySha256: projections.topology_sha256,
      topologyProjectionVersion: projections.topology_projection_version,
      startDate: projections.feed_start_date,
      endDate: projections.feed_end_date,
      maximumDepartureSeconds: projections.maximum_departure_seconds,
      completedAt: projections.completed_at,
    })
    .from(projections)
    .where(
      inArray(projections.projector_version, [
        SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
        COMBINED_DEPARTURE_PROJECTOR_VERSION,
      ]),
    )
    .orderBy(asc(projections.id))
    .limit(MAX_ARRIVAL_VERSIONS + 1);
  const projectionIds = indexed.map((row) => row.id);
  const dayRows = projectionIds.length
    ? await tx
        .select()
        .from(days)
        .where(inArray(days.projection_id, projectionIds))
        .orderBy(asc(days.projection_id), asc(days.service_date))
        .limit(MAX_ARRIVAL_DAY_ROWS + 1)
    : [];
  const scopeRows = projectionIds.length
    ? await tx
        .select()
        .from(scopes)
        .where(inArray(scopes.projection_id, projectionIds))
        .orderBy(
          asc(scopes.projection_id),
          asc(scopes.service_date),
          asc(scopes.station_id),
          asc(scopes.line_id),
          asc(scopes.service_id),
          asc(scopes.destination_station_id),
        )
        .limit(MAX_ARRIVAL_SCOPE_ROWS + 1)
    : [];
  const stationNames = await tx
    .select({ id: stationsTable.id, name: stationsTable.name })
    .from(stationsTable)
    .orderBy(asc(stationsTable.id));
  const serviceNames = await tx
    .select({ id: servicesTable.id, name: servicesTable.name })
    .from(servicesTable)
    .orderBy(asc(servicesTable.id));
  return parseArrivalInputs({
    attestation,
    topology,
    history: history.map(({ manifestBytes, ...row }) => ({
      ...row,
      manifestBase64: manifestBytes.toString('base64'),
    })),
    projections: indexed,
    days: dayRows,
    scopes: scopeRows,
    stationNames: stationNames.map((row) => ({
      ...row,
      name: parseTranslations(row.name),
    })),
    serviceNames: serviceNames.map((row) => ({
      ...row,
      name: parseTranslations(row.name),
    })),
  });
}
