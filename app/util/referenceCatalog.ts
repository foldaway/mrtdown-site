import type { Translations } from '@mrtdown/core';
import { asc, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { getDb } from '~/db';
import {
  linesTable,
  metadataTable,
  stationCodesTable,
  stationsTable,
} from '~/db/schema';

const SG_TIMEZONE = 'Asia/Singapore';
const DATASET_VERSION_METADATA_KEY = 'manifest_last_pulled_at';

type AppDb = ReturnType<typeof getDb>;

type ReferenceCatalogLineRow = {
  id: string;
  startedAt: string;
  endedAt: string | null;
};

type ReferenceCatalogStationRow = {
  id: string;
  name: Translations;
};

type ReferenceCatalogMembershipRow = {
  stationId: string;
  lineId: string;
  publicCode: string;
  startedAt: string;
  endedAt: string | null;
};

type BuildReferenceCatalogInput = {
  datasetVersion: string;
  referenceDate: string;
  lines: ReferenceCatalogLineRow[];
  stations: ReferenceCatalogStationRow[];
  memberships: ReferenceCatalogMembershipRow[];
};

export class ReferenceCatalogUnavailableError extends Error {}

function compareText(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isActiveOnDate(
  item: { startedAt: string; endedAt: string | null },
  referenceDate: string,
) {
  return (
    item.startedAt <= referenceDate &&
    (item.endedAt == null || item.endedAt >= referenceDate)
  );
}

function buildStationAliases(names: Translations) {
  return [
    ...new Set(
      Object.values(names).flatMap((name) => {
        const normalized = name?.trim();
        return normalized ? [normalized] : [];
      }),
    ),
  ].sort(compareText);
}

export function buildReferenceCatalog({
  datasetVersion,
  referenceDate,
  lines,
  stations,
  memberships,
}: BuildReferenceCatalogInput) {
  const activeLines = lines
    .filter((line) => isActiveOnDate(line, referenceDate))
    .sort((left, right) => compareText(left.id, right.id));
  const activeLineIds = new Set(activeLines.map((line) => line.id));
  const activeMemberships = memberships
    .filter(
      (membership) =>
        activeLineIds.has(membership.lineId) &&
        isActiveOnDate(membership, referenceDate),
    )
    .sort(
      (left, right) =>
        compareText(left.stationId, right.stationId) ||
        compareText(left.lineId, right.lineId) ||
        compareText(left.publicCode, right.publicCode),
    );
  const activeStationIds = new Set(
    activeMemberships.map((membership) => membership.stationId),
  );
  const publicCodesByStationId = new Map<string, Set<string>>();
  for (const membership of activeMemberships) {
    const publicCodes =
      publicCodesByStationId.get(membership.stationId) ?? new Set<string>();
    publicCodes.add(membership.publicCode);
    publicCodesByStationId.set(membership.stationId, publicCodes);
  }

  return {
    schemaVersion: 1 as const,
    datasetVersion,
    referenceDate,
    lines: activeLines.map((line) => ({
      id: line.id,
      validFrom: line.startedAt,
      validTo: line.endedAt,
    })),
    stations: stations
      .filter((station) => activeStationIds.has(station.id))
      .sort((left, right) => compareText(left.id, right.id))
      .map((station) => ({
        id: station.id,
        names: station.name,
        aliases: buildStationAliases(station.name),
        publicCodes: [
          ...(publicCodesByStationId.get(station.id) ?? new Set()),
        ].sort(compareText),
      })),
    memberships: activeMemberships.map((membership) => ({
      stationId: membership.stationId,
      lineId: membership.lineId,
      publicCode: membership.publicCode,
      validFrom: membership.startedAt,
      validTo: membership.endedAt,
    })),
  };
}

export async function getReferenceCatalog(
  db: AppDb,
  now = DateTime.now().setZone(SG_TIMEZONE),
) {
  const referenceDate = now.toISODate();
  if (referenceDate == null) {
    throw new ReferenceCatalogUnavailableError('Reference date is unavailable');
  }

  const [metadataRows, lines, stations, memberships] = await Promise.all([
    db
      .select({ value: metadataTable.value })
      .from(metadataTable)
      .where(eq(metadataTable.key, DATASET_VERSION_METADATA_KEY))
      .limit(1),
    db
      .select({
        id: linesTable.id,
        startedAt: linesTable.started_at,
        endedAt: linesTable.ended_at,
      })
      .from(linesTable)
      .orderBy(asc(linesTable.id)),
    db
      .select({ id: stationsTable.id, name: stationsTable.name })
      .from(stationsTable)
      .orderBy(asc(stationsTable.id)),
    db
      .select({
        stationId: stationCodesTable.station_id,
        lineId: stationCodesTable.line_id,
        publicCode: stationCodesTable.code,
        startedAt: stationCodesTable.started_at,
        endedAt: stationCodesTable.ended_at,
      })
      .from(stationCodesTable)
      .innerJoin(linesTable, eq(stationCodesTable.line_id, linesTable.id))
      .orderBy(
        asc(stationCodesTable.station_id),
        asc(stationCodesTable.line_id),
        asc(stationCodesTable.code),
      ),
  ]);

  const datasetVersion = metadataRows[0]?.value;
  if (
    datasetVersion == null ||
    !DateTime.fromISO(datasetVersion, { setZone: true }).isValid
  ) {
    throw new ReferenceCatalogUnavailableError(
      'Dataset version is unavailable',
    );
  }

  return buildReferenceCatalog({
    datasetVersion,
    referenceDate,
    lines,
    stations,
    memberships,
  });
}
