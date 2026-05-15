import { MRTDownRepository } from '@mrtdown/fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../db/schema.js';
import { ZipStore } from '../helpers/ZipStore.js';
import { fetchArchive } from '../workflows/pull/helpers/fetchArchive.js';
import { fetchManifest } from '../workflows/pull/helpers/fetchManifest.js';
import {
  finalizePull,
  insertIssuesStaging,
  insertLandmarksStaging,
  insertLinesStaging,
  insertOperatorsStaging,
  insertServicesStaging,
  insertStationsStaging,
  insertTownsStaging,
  syncIssues,
  syncLines,
  syncOperatorsTownsLandmarks,
  syncServices,
  syncStations,
  truncateStagingTables,
} from '../workflows/pull/helpers/stagingSync.js';

const { Pool } = pg;

const DEFAULT_FIXTURES_BASE_URL =
  'https://foldaway.github.io/mrtdown-data/fixtures';

type Db = Parameters<typeof truncateStagingTables>[0];

function placeholderHash(entityName: string, id: string): string {
  return `preview-fixture-placeholder:${entityName}:${id}`;
}

function placeholderName(id: string) {
  return {
    'en-SG': id,
    'zh-Hans': null,
    ms: null,
    ta: null,
  };
}

async function stageFixtures(db: Db, baseUrl: string): Promise<void> {
  const manifest = await fetchManifest(baseUrl);
  const archiveBuffer = await fetchArchive(baseUrl);
  const store = new ZipStore(archiveBuffer);
  const repo = new MRTDownRepository({ store });

  await truncateStagingTables(db);

  const lines = repo.lines.list().map((line) => ({
    ...line,
    hash: manifest.lines[line.id] ?? '',
  }));
  const stations = repo.stations.list().map((station) => ({
    ...station,
    hash: manifest.stations[station.id] ?? '',
  }));

  const operatorRows = new Map(
    repo.operators.list().map((operator) => [
      operator.id,
      {
        ...operator,
        hash: manifest.operators[operator.id] ?? '',
      },
    ]),
  );
  for (const line of lines) {
    for (const operator of line.operators) {
      if (!operatorRows.has(operator.operatorId)) {
        operatorRows.set(operator.operatorId, {
          id: operator.operatorId,
          hash: placeholderHash('operator', operator.operatorId),
          name: placeholderName(operator.operatorId),
          foundedAt: '1900-01-01',
          url: null,
        });
      }
    }
  }
  const operators = Array.from(operatorRows.values());
  await insertOperatorsStaging(db, operators);
  store.clearCache();

  const townRows = new Map(
    repo.towns.list().map((town) => [
      town.id,
      {
        ...town,
        hash: manifest.towns[town.id] ?? '',
      },
    ]),
  );
  for (const station of stations) {
    if (!townRows.has(station.townId)) {
      townRows.set(station.townId, {
        id: station.townId,
        hash: placeholderHash('town', station.townId),
        name: placeholderName(station.townId),
      });
    }
  }
  const towns = Array.from(townRows.values());
  await insertTownsStaging(db, towns);
  store.clearCache();

  const landmarkRows = new Map(
    repo.landmarks.list().map((landmark) => [
      landmark.id,
      {
        ...landmark,
        hash: manifest.landmarks[landmark.id] ?? '',
      },
    ]),
  );
  for (const station of stations) {
    for (const landmarkId of station.landmarkIds) {
      if (!landmarkRows.has(landmarkId)) {
        landmarkRows.set(landmarkId, {
          id: landmarkId,
          hash: placeholderHash('landmark', landmarkId),
          name: placeholderName(landmarkId),
        });
      }
    }
  }
  const landmarks = Array.from(landmarkRows.values());
  await insertLandmarksStaging(db, landmarks);
  store.clearCache();

  await insertLinesStaging(db, lines);
  store.clearCache();

  const issues = repo.issues.list().map((issue) => ({
    issue: {
      ...issue.issue,
      hash: manifest.issues[issue.issue.id] ?? '',
    },
    evidence: issue.evidence,
    impactEvents: issue.impactEvents,
  }));
  await insertIssuesStaging(db, issues);
  store.clearCache();

  await insertStationsStaging(db, stations);
  store.clearCache();

  const services = repo.services.list().map((service) => ({
    ...service,
    hash: manifest.services[service.id] ?? '',
  }));
  await insertServicesStaging(db, services);
  store.clearCache();

  console.log(
    `Staged ${operators.length} operators, ${towns.length} towns, ${landmarks.length} landmarks, ${lines.length} lines, ${stations.length} stations, ${services.length} services, ${issues.length} issues`,
  );
}

async function syncSeededData(db: Db): Promise<void> {
  await syncOperatorsTownsLandmarks(db);
  await syncLines(db);
  await syncStations(db);
  await syncServices(db);
  await syncIssues(db);
  await finalizePull(db);
}

async function main(): Promise<void> {
  const { DATABASE_URL } = process.env;
  if (DATABASE_URL == null || DATABASE_URL.length === 0) {
    throw new Error('DATABASE_URL must be set');
  }

  const fixturesBaseUrl =
    process.env.FIXTURES_BASE_URL ?? DEFAULT_FIXTURES_BASE_URL;
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema }) as Db;

  try {
    console.log(`Seeding preview database from ${fixturesBaseUrl}`);
    await stageFixtures(db, fixturesBaseUrl);
    await syncSeededData(db);
    console.log('Preview fixture seed complete');
  } finally {
    await pool.end();
  }
}

await main();
