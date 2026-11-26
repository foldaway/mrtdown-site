import type { Translations } from '@mrtdown/core';
import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { DateTime } from 'luxon';
import { getDefaultDb } from './dbQueries/database';
import { readCrowdReportFormOptionRows } from './dbQueries/reportReferenceInputs';
import { reportReferenceSnapshotStore } from './reportReferenceSnapshot.server';
import { selectServiceRevisionForReferenceDate } from './serviceRevisions';

const SG_TIMEZONE = 'Asia/Singapore';

type CrowdReportFormLineRow = {
  id: string;
  name: Translations;
  color: string;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
};

type CrowdReportFormStationRow = {
  id: string;
  name: Translations;
};

type CrowdReportFormStationCodeRow = {
  lineId: string;
  stationId: string;
  code: string;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
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

function normalizeDateValue(value: Date | string | null | undefined) {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value, { zone: 'utc' }).toISODate();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = DateTime.fromISO(value, { setZone: true });
  return parsed.isValid ? parsed.setZone(SG_TIMEZONE).toISODate() : value;
}

function isEntityInOperationOnDate(
  entity: {
    startedAt?: Date | string | null;
    endedAt?: Date | string | null;
  },
  referenceDate: string,
) {
  const startedAt = normalizeDateValue(entity.startedAt);
  const endedAt = normalizeDateValue(entity.endedAt);
  if (startedAt != null && startedAt > referenceDate) {
    return false;
  }
  if (endedAt != null && endedAt < referenceDate) {
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
    .filter((line) => isEntityInOperationOnDate(line, referenceDate))
    .map(({ id, name, color }) => ({ id, name, color }));
  const operatingLineIds = new Set(operatingLines.map((line) => line.id));
  const operatingStationCodes = stationCodes.filter(
    (code) =>
      operatingLineIds.has(code.lineId) &&
      isEntityInOperationOnDate(code, referenceDate),
  );
  const operatingStationIds = new Set(
    operatingStationCodes.map((code) => code.stationId),
  );
  const operatingStationLineKeys = new Set(
    operatingStationCodes.map((code) => `${code.lineId}::${code.stationId}`),
  );
  const operatingStations = stations.filter((station) =>
    operatingStationIds.has(station.id),
  );
  const operatingServices = services.filter((service) =>
    operatingLineIds.has(service.lineId),
  );
  const stationById = Object.fromEntries(
    operatingStations.map((station) => [station.id, station]),
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
      .filter((stationId) =>
        operatingStationLineKeys.has(`${service.lineId}::${stationId}`),
      );
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
  const referenceDate =
    DateTime.now().setZone(SG_TIMEZONE).toISODate() ??
    new Date().toISOString().slice(0, 10);
  const published = process.env.REDIS_URL
    ? await reportReferenceSnapshotStore.read()
    : null;
  if (!published && process.env.REDIS_URL)
    setResponseHeader('Cache-Control', 'no-store');
  const rows =
    published?.inputs.formOptionRows ??
    (await readCrowdReportFormOptionRows(await getDefaultDb()));
  // The server function has always returned Date objects in these raw rows.
  const formOptionRows = {
    ...rows,
    serviceRevisions: rows.serviceRevisions.map((row) => ({
      ...row,
      updated_at: new Date(row.updated_at),
    })),
  };
  return {
    ...buildCrowdReportFormOptions({ referenceDate, ...formOptionRows }),
    formOptionRows,
  };
});
