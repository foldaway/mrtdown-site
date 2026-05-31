import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { getDb } from '~/db';
import {
  linesTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesTable,
  stationCodesTable,
  stationsTable,
} from '~/db/schema';
import {
  type CrowdReportFeatureEnv,
  isCrowdReportsFeatureEnabled,
} from './crowdReportFeatureFlag';
import { selectServiceRevisionForReferenceDate } from './serviceRevisions';

export const getCrowdReportFormOptionsFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  if (
    !isCrowdReportsFeatureEnabled(env as CrowdReportFeatureEnv, {
      isLocalDev: import.meta.env.DEV,
    })
  ) {
    throw new Response('Not Found', {
      status: 404,
      statusText: 'Not Found',
    });
  }

  const db = getDb();
  const referenceDate =
    DateTime.now().setZone('Asia/Singapore').toISODate() ??
    new Date().toISOString().slice(0, 10);
  const [
    lines,
    stations,
    stationCodes,
    services,
    serviceRevisionsWithPathRows,
  ] = await Promise.all([
    db
      .select({
        id: linesTable.id,
        name: linesTable.name,
        color: linesTable.color,
      })
      .from(linesTable)
      .orderBy(asc(linesTable.id)),
    db
      .select({
        id: stationsTable.id,
        name: stationsTable.name,
      })
      .from(stationsTable)
      .orderBy(asc(stationsTable.id)),
    db
      .select({
        lineId: stationCodesTable.line_id,
        stationId: stationCodesTable.station_id,
        code: stationCodesTable.code,
      })
      .from(stationCodesTable)
      .orderBy(asc(stationCodesTable.code)),
    db
      .select({
        id: servicesTable.id,
        lineId: servicesTable.line_id,
      })
      .from(servicesTable)
      .orderBy(asc(servicesTable.id)),
    db
      .select({
        id: serviceRevisionsTable.id,
        serviceId: serviceRevisionsTable.service_id,
        start_at: serviceRevisionsTable.start_at,
        end_at: serviceRevisionsTable.end_at,
        updated_at: serviceRevisionsTable.updated_at,
      })
      .from(serviceRevisionsTable)
      .innerJoin(
        serviceRevisionPathStationEntriesTable,
        and(
          eq(
            serviceRevisionPathStationEntriesTable.service_revision_id,
            serviceRevisionsTable.id,
          ),
          eq(
            serviceRevisionPathStationEntriesTable.service_id,
            serviceRevisionsTable.service_id,
          ),
        ),
      )
      .orderBy(serviceRevisionsTable.service_id, serviceRevisionsTable.id),
  ]);

  const stationById = Object.fromEntries(
    stations.map((station) => [station.id, station]),
  );
  const serviceRevisionByKey = new Map<
    string,
    (typeof serviceRevisionsWithPathRows)[number]
  >();
  for (const revision of serviceRevisionsWithPathRows) {
    serviceRevisionByKey.set(`${revision.serviceId}::${revision.id}`, revision);
  }
  const revisionsByServiceId = Array.from(serviceRevisionByKey.values()).reduce<
    Record<string, (typeof serviceRevisionsWithPathRows)[number][]>
  >((acc, revision) => {
    acc[revision.serviceId] ??= [];
    acc[revision.serviceId].push(revision);
    return acc;
  }, {});
  const latestRevisionByServiceId = Object.fromEntries(
    Object.entries(revisionsByServiceId)
      .map(([serviceId, revisions]) => {
        const revision = selectServiceRevisionForReferenceDate(
          revisions,
          referenceDate,
        );
        return revision == null ? null : ([serviceId, revision] as const);
      })
      .filter(
        (
          entry,
        ): entry is readonly [
          string,
          (typeof serviceRevisionsWithPathRows)[number],
        ] => entry != null,
      ),
  );

  const latestRevisionIds = [
    ...new Set(
      Object.values(latestRevisionByServiceId).map((revision) => revision.id),
    ),
  ];
  const servicePathEntries =
    latestRevisionIds.length > 0
      ? await db
          .select({
            serviceRevisionId:
              serviceRevisionPathStationEntriesTable.service_revision_id,
            serviceId: serviceRevisionPathStationEntriesTable.service_id,
            stationId: serviceRevisionPathStationEntriesTable.station_id,
            pathIndex: serviceRevisionPathStationEntriesTable.path_index,
          })
          .from(serviceRevisionPathStationEntriesTable)
          .where(
            inArray(
              serviceRevisionPathStationEntriesTable.service_revision_id,
              latestRevisionIds,
            ),
          )
      : [];

  const servicePathEntriesByRevisionKey = servicePathEntries.reduce<
    Record<string, typeof servicePathEntries>
  >((acc, entry) => {
    const key = `${entry.serviceRevisionId}::${entry.serviceId}`;
    acc[key] ??= [];
    acc[key].push(entry);
    return acc;
  }, {});

  const directionsByLineId: Record<
    string,
    Array<{ stationId: string; name: (typeof stations)[number]['name'] }>
  > = {};
  const directionKeysByLineId: Record<string, Set<string>> = {};
  const stationPathsByLineId: Record<string, string[][]> = {};
  const stationPathKeysByLineId: Record<string, Set<string>> = {};

  for (const service of services) {
    const latestRevision = latestRevisionByServiceId[service.id];
    if (latestRevision == null) {
      continue;
    }

    const entries = [
      ...(servicePathEntriesByRevisionKey[
        `${latestRevision.id}::${service.id}`
      ] ?? []),
    ].sort((a, b) => a.pathIndex - b.pathIndex);
    const pathStationIds = entries.map((entry) => entry.stationId);
    if (pathStationIds.length > 0) {
      stationPathsByLineId[service.lineId] ??= [];
      stationPathKeysByLineId[service.lineId] ??= new Set();
      const pathKey = pathStationIds.join('>');
      if (!stationPathKeysByLineId[service.lineId].has(pathKey)) {
        stationPathKeysByLineId[service.lineId].add(pathKey);
        stationPathsByLineId[service.lineId].push(pathStationIds);
      }
    }
    const terminalStationIds = [
      entries[0]?.stationId,
      entries[entries.length - 1]?.stationId,
    ].filter((stationId): stationId is string => stationId != null);

    for (const stationId of terminalStationIds) {
      const station = stationById[stationId];
      if (station == null) {
        continue;
      }
      directionsByLineId[service.lineId] ??= [];
      directionKeysByLineId[service.lineId] ??= new Set();
      if (directionKeysByLineId[service.lineId].has(stationId)) {
        continue;
      }
      directionKeysByLineId[service.lineId].add(stationId);
      directionsByLineId[service.lineId].push({
        stationId,
        name: station.name,
      });
    }
  }

  for (const lineDirections of Object.values(directionsByLineId)) {
    lineDirections.sort((a, b) => a.stationId.localeCompare(b.stationId));
  }

  const stationCodesByStationId = stationCodes.reduce<Record<string, string[]>>(
    (acc, code) => {
      acc[code.stationId] ??= [];
      if (!acc[code.stationId].includes(code.code)) {
        acc[code.stationId].push(code.code);
      }
      return acc;
    },
    {},
  );

  const stationCodePillsByStationId = stationCodes.reduce<
    Record<string, Array<{ code: string; lineId: string }>>
  >((acc, code) => {
    acc[code.stationId] ??= [];
    if (
      !acc[code.stationId].some(
        (entry) => entry.code === code.code && entry.lineId === code.lineId,
      )
    ) {
      acc[code.stationId].push({
        code: code.code,
        lineId: code.lineId,
      });
    }
    return acc;
  }, {});

  const stationLineIdsByStationId = stationCodes.reduce<
    Record<string, string[]>
  >((acc, code) => {
    acc[code.stationId] ??= [];
    if (!acc[code.stationId].includes(code.lineId)) {
      acc[code.stationId].push(code.lineId);
    }
    return acc;
  }, {});

  for (const lineIds of Object.values(stationLineIdsByStationId)) {
    lineIds.sort((a, b) => a.localeCompare(b));
  }

  return {
    lines,
    lineDirections: directionsByLineId,
    lineStationPaths: stationPathsByLineId,
    stations: stations.map((station) => ({
      ...station,
      codes: stationCodesByStationId[station.id] ?? [],
      codePills: stationCodePillsByStationId[station.id] ?? [],
      lineIds: stationLineIdsByStationId[station.id] ?? [],
    })),
  };
});
