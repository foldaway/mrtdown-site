import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import { asc } from 'drizzle-orm';
import { getDb } from '~/db';
import { linesTable, stationCodesTable, stationsTable } from '~/db/schema';
import {
  type CrowdReportFeatureEnv,
  isCrowdReportsFeatureEnabled,
} from './crowdReportFeatureFlag';

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
  const [lines, stations, stationCodes] = await Promise.all([
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
        stationId: stationCodesTable.station_id,
        code: stationCodesTable.code,
      })
      .from(stationCodesTable)
      .orderBy(asc(stationCodesTable.code)),
  ]);

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

  return {
    lines,
    stations: stations.map((station) => ({
      ...station,
      codes: stationCodesByStationId[station.id] ?? [],
    })),
  };
});
