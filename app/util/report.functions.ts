import { env } from 'cloudflare:workers';
import type { Translations } from '@mrtdown/core';
import { createServerFn } from '@tanstack/react-start';
import { and, asc, eq } from 'drizzle-orm';
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

type CrowdReportFormLineRow = {
  id: string;
  name: Translations;
  color: string;
  startedAt?: string | null;
  endedAt?: string | null;
};

type CrowdReportFormStationRow = {
  id: string;
  name: Translations;
};

type CrowdReportFormStationCodeRow = {
  lineId: string;
  stationId: string;
  code: string;
  startedAt?: string | null;
  endedAt?: string | null;
};

type CrowdReportFormServiceRow = {
  id: string;
  lineId: string;
};

type CrowdReportFormServiceRevisionRow = {
  id: string;
  serviceId: string;
  start_at: string | null;
  end_at: string | null;
  updated_at: Date | string;
};

type CrowdReportFormPathEntryRow = {
  serviceRevisionId: string;
  serviceId: string;
  stationId: string;
  pathIndex: number;
};

type BuildCrowdReportFormOptionsInput = {
  referenceDate: string;
  lines: CrowdReportFormLineRow[];
  stations: CrowdReportFormStationRow[];
  stationCodes: CrowdReportFormStationCodeRow[];
  services: CrowdReportFormServiceRow[];
  serviceRevisions: CrowdReportFormServiceRevisionRow[];
  servicePathEntries: CrowdReportFormPathEntryRow[];
};

function isLineInOperationOnDate(
  entity: {
    startedAt?: string | null;
    endedAt?: string | null;
  },
  referenceDate: string,
) {
  if (entity.startedAt != null && entity.startedAt > referenceDate) {
    return false;
  }
  if (entity.endedAt != null && entity.endedAt < referenceDate) {
    return false;
  }
  return true;
}

export function buildCrowdReportFormOptions({
  referenceDate,
  lines,
  stations,
  stationCodes,
  services,
  serviceRevisions,
  servicePathEntries,
}: BuildCrowdReportFormOptionsInput) {
  const operatingLines = lines
    .filter((line) => isLineInOperationOnDate(line, referenceDate))
    .map(({ id, name, color }) => ({ id, name, color }));
  const operatingLineIds = new Set(operatingLines.map((line) => line.id));
  const operatingStationCodes = stationCodes.filter(
    (code) =>
      operatingLineIds.has(code.lineId) &&
      isLineInOperationOnDate(code, referenceDate),
  );
  const operatingStationIds = new Set(
    operatingStationCodes.map((code) => code.stationId),
  );
  const operatingStations = stations.filter((station) =>
    operatingStationIds.has(station.id),
  );
  const operatingServices = services.filter((service) =>
    operatingLineIds.has(service.lineId),
  );
  const stationById = Object.fromEntries(
    stations.map((station) => [station.id, station]),
  );
  const revisionsByServiceId = serviceRevisions.reduce<
    Record<string, CrowdReportFormServiceRevisionRow[]>
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
        ): entry is readonly [string, CrowdReportFormServiceRevisionRow] =>
          entry != null,
      ),
  );

  const servicePathEntriesByRevisionKey = servicePathEntries.reduce<
    Record<string, CrowdReportFormPathEntryRow[]>
  >((acc, entry) => {
    const key = `${entry.serviceRevisionId}::${entry.serviceId}`;
    acc[key] ??= [];
    acc[key].push(entry);
    return acc;
  }, {});

  const directionsByLineId: Record<
    string,
    Array<{ stationId: string; name: CrowdReportFormStationRow['name'] }>
  > = {};
  const directionKeysByLineId: Record<string, Set<string>> = {};
  const stationPathsByLineId: Record<string, string[][]> = {};
  const stationPathKeysByLineId: Record<string, Set<string>> = {};

  for (const service of operatingServices) {
    const latestRevision = latestRevisionByServiceId[service.id];
    if (latestRevision == null) {
      continue;
    }

    const entries = [
      ...(servicePathEntriesByRevisionKey[
        `${latestRevision.id}::${service.id}`
      ] ?? []),
    ].sort((a, b) => a.pathIndex - b.pathIndex);
    const pathStationIds = entries
      .map((entry) => entry.stationId)
      .filter((stationId) => operatingStationIds.has(stationId));
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
      pathStationIds[0],
      pathStationIds[pathStationIds.length - 1],
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

  const stationCodesByStationId = operatingStationCodes.reduce<
    Record<string, string[]>
  >((acc, code) => {
    acc[code.stationId] ??= [];
    if (!acc[code.stationId].includes(code.code)) {
      acc[code.stationId].push(code.code);
    }
    return acc;
  }, {});

  const stationCodePillsByStationId = operatingStationCodes.reduce<
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

  const stationLineIdsByStationId = operatingStationCodes.reduce<
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
    lines: operatingLines,
    lineDirections: directionsByLineId,
    lineStationPaths: stationPathsByLineId,
    stations: operatingStations.map((station) => ({
      ...station,
      codes: stationCodesByStationId[station.id] ?? [],
      codePills: stationCodePillsByStationId[station.id] ?? [],
      lineIds: stationLineIdsByStationId[station.id] ?? [],
    })),
  };
}

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
        startedAt: linesTable.started_at,
        endedAt: linesTable.ended_at,
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
        startedAt: stationCodesTable.started_at,
        endedAt: stationCodesTable.ended_at,
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

  const serviceRevisionByKey = new Map<
    string,
    (typeof serviceRevisionsWithPathRows)[number]
  >();
  for (const revision of serviceRevisionsWithPathRows) {
    serviceRevisionByKey.set(`${revision.serviceId}::${revision.id}`, revision);
  }
  const serviceRevisions = Array.from(serviceRevisionByKey.values());
  const servicePathEntries = await db
    .select({
      serviceRevisionId:
        serviceRevisionPathStationEntriesTable.service_revision_id,
      serviceId: serviceRevisionPathStationEntriesTable.service_id,
      stationId: serviceRevisionPathStationEntriesTable.station_id,
      pathIndex: serviceRevisionPathStationEntriesTable.path_index,
    })
    .from(serviceRevisionPathStationEntriesTable);

  const formOptionRows = {
    lines,
    stations,
    stationCodes,
    services,
    serviceRevisions,
    servicePathEntries,
  };

  return {
    ...buildCrowdReportFormOptions({
      referenceDate,
      ...formOptionRows,
    }),
    formOptionRows,
  };
});
