import { ServiceRevisionSchema } from '@mrtdown/core';
import type { readScheduleTopology } from '@mrtdown/fs';
import { eq } from 'drizzle-orm';
import type { getDb } from '~/db';
import { CANONICAL_TOPOLOGY_PROMOTION_KEY } from '~/db/canonicalTopologyPromotion';
import {
  stationCodesTable as codes,
  lineOperatorsTable as lineOperators,
  lineServicesTable as lineServices,
  linesTable as lines,
  metadataTable,
  operatorsTable as operators,
  serviceRevisionPathStationEntriesTable as paths,
  stationPlatformServicesTable as platformServices,
  stationPlatformsTable as platforms,
  serviceRevisionsTable as revisions,
  servicesTable as services,
  stationsTable as stations,
} from '~/db/schema';

type Database = ReturnType<typeof getDb>;
type ReadTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Topology = Awaited<ReturnType<typeof readScheduleTopology>>;

function sorted<T>(values: T[]): T[] {
  return values.sort((left, right) => {
    const a = JSON.stringify(left);
    const b = JSON.stringify(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function parent<T>(values: Map<string, T>, id: string): T {
  const value = values.get(id);
  if (value === undefined) {
    throw new Error('Live canonical topology has an inconsistent relationship');
  }
  return value;
}

const revisionDates = ServiceRevisionSchema.pick({
  startAt: true,
  endAt: true,
});
const key = (...ids: string[]) => JSON.stringify(ids);

/** Read only through the owning repeatable-read transaction, never a candidate's topology. */
export async function readLiveScheduleTopology(
  tx: ReadTransaction,
): Promise<Topology> {
  const [promotion] = await tx
    .select({ value: metadataTable.value })
    .from(metadataTable)
    .where(eq(metadataTable.key, CANONICAL_TOPOLOGY_PROMOTION_KEY));
  if (promotion?.value !== '1') {
    throw new Error('Live canonical topology requires a completed promotion');
  }

  const operatorRows = await tx.select({ id: operators.id }).from(operators);
  const lineRows = await tx
    .select({ id: lines.id, type: lines.type })
    .from(lines);
  const lineOperatorRows = await tx
    .select({
      lineId: lineOperators.line_id,
      operatorId: lineOperators.operator_id,
      startedAt: lineOperators.started_at,
      endedAt: lineOperators.ended_at,
    })
    .from(lineOperators);
  const lineServiceRows = await tx
    .select({
      lineId: lineServices.line_id,
      serviceId: lineServices.service_id,
    })
    .from(lineServices);
  const stationRows = await tx.select({ id: stations.id }).from(stations);
  const codeRows = await tx
    .select({
      stationId: codes.station_id,
      lineId: codes.line_id,
      code: codes.code,
      startedAt: codes.started_at,
      endedAt: codes.ended_at,
    })
    .from(codes);
  const platformRows = await tx
    .select({
      stationId: platforms.station_id,
      id: platforms.platform_id,
      label: platforms.label,
      lineId: platforms.line_id,
      boardingStatus: platforms.boarding_status,
    })
    .from(platforms);
  const platformServiceRows = await tx
    .select({
      stationId: platformServices.station_id,
      platformId: platformServices.platform_id,
      serviceId: platformServices.service_id,
    })
    .from(platformServices);
  const serviceRows = await tx
    .select({ id: services.id, lineId: services.line_id })
    .from(services);
  const revisionRows = await tx
    .select({
      serviceId: revisions.service_id,
      id: revisions.id,
      startAt: revisions.start_at,
      endAt: revisions.end_at,
    })
    .from(revisions);
  const pathRows = await tx
    .select({
      serviceId: paths.service_id,
      revisionId: paths.service_revision_id,
      stationId: paths.station_id,
      displayCode: paths.display_code,
      pathIndex: paths.path_index,
    })
    .from(paths)
    .orderBy(paths.path_index);
  if (
    !operatorRows.length ||
    !lineRows.length ||
    !stationRows.length ||
    !serviceRows.length
  ) {
    throw new Error(
      'Canonical topology requires operators, lines, stations and services',
    );
  }
  const operatorById = new Map(operatorRows.map((row) => [row.id, row]));
  const lineById = new Map<string, Topology['lines'][number]>(
    lineRows.map((row) => [row.id, { ...row, serviceIds: [], operators: [] }]),
  );
  const stationById = new Map<string, Topology['stations'][number]>(
    stationRows.map((row) => [
      row.id,
      { ...row, stationCodes: [], platforms: [] },
    ]),
  );
  const serviceById = new Map<string, Topology['services'][number]>(
    serviceRows.map((row) => [row.id, { ...row, revisions: [] }]),
  );
  for (const { lineId, ...operator } of lineOperatorRows) {
    parent(operatorById, operator.operatorId);
    parent(lineById, lineId).operators.push(operator);
  }
  for (const { lineId, serviceId } of lineServiceRows) {
    if (parent(serviceById, serviceId).lineId !== lineId) {
      throw new Error('Live canonical topology has inconsistent line services');
    }
    parent(lineById, lineId).serviceIds.push(serviceId);
  }
  for (const service of serviceById.values()) {
    if (!parent(lineById, service.lineId).serviceIds.includes(service.id)) {
      throw new Error('Live canonical topology is missing a line service');
    }
  }
  for (const { stationId, ...code } of codeRows) {
    parent(lineById, code.lineId);
    parent(stationById, stationId).stationCodes.push(code);
  }
  const platformByKey = new Map<
    string,
    Topology['stations'][number]['platforms'][number]
  >();
  for (const { stationId, ...row } of platformRows) {
    parent(lineById, row.lineId);
    const platform = {
      id: row.id,
      label: row.label,
      lineId: row.lineId,
      serviceIds: [] as string[],
      boardingStatus: row.boardingStatus,
    };
    parent(stationById, stationId).platforms.push(platform);
    platformByKey.set(key(stationId, row.id), platform);
  }
  for (const { stationId, platformId, serviceId } of platformServiceRows) {
    const platform = parent(platformByKey, key(stationId, platformId));
    if (
      parent(serviceById, serviceId).lineId !== platform.lineId ||
      platform.boardingStatus !== null
    ) {
      throw new Error(
        'Live canonical topology has inconsistent platform services',
      );
    }
    platform.serviceIds.push(serviceId);
  }
  const revisionByKey = new Map<
    string,
    Topology['services'][number]['revisions'][number]
  >();
  for (const { serviceId, id, startAt, endAt } of revisionRows) {
    // Legacy nullable start_at cannot be invented from path or import dates.
    const dates = revisionDates.parse({ startAt, endAt });
    const revision = {
      id,
      ...dates,
      stations: [] as { stationId: string; displayCode: string }[],
    };
    parent(serviceById, serviceId).revisions.push(revision);
    revisionByKey.set(key(serviceId, id), revision);
  }
  for (const {
    serviceId,
    revisionId,
    stationId,
    displayCode,
    pathIndex,
  } of pathRows) {
    parent(stationById, stationId);
    const revision = parent(revisionByKey, key(serviceId, revisionId));
    if (pathIndex !== revision.stations.length) {
      throw new Error(
        'Live canonical topology has an incomplete or ambiguous path order',
      );
    }
    revision.stations.push({ stationId, displayCode });
  }

  // Match @mrtdown/fs scheduleTopologyProjection v1, including property order.
  // Its full-entity input would require unrelated names/geography/hours here.
  return {
    projectionVersion: 1,
    operators: sorted(operatorRows),
    lines: sorted(
      [...lineById.values()].map(({ id, type, serviceIds, operators }) => ({
        id,
        type,
        serviceIds: serviceIds.sort(),
        operators: sorted(operators),
      })),
    ),
    stations: sorted(
      [...stationById.values()].map(({ id, stationCodes, platforms }) => ({
        id,
        stationCodes: sorted(stationCodes),
        platforms: sorted(
          platforms.map((platform) => ({
            ...platform,
            serviceIds: platform.serviceIds.sort(),
          })),
        ),
      })),
    ),
    services: sorted(
      [...serviceById.values()].map(({ id, lineId, revisions }) => ({
        id,
        lineId,
        revisions: sorted(revisions),
      })),
    ),
  };
}
