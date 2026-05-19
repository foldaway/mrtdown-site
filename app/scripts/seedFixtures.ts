import { MRTDownRepository } from '@mrtdown/fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../db/schema.js';
import { ZipStore } from '../helpers/ZipStore.js';
import { rebuildOperationalFactsRange } from '../util/db.queries.js';
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
const OPERATIONAL_FACTS_REBUILD_DAYS = 400;

type Db = Parameters<typeof truncateStagingTables>[0];

async function stageFixtures(db: Db, baseUrl: string): Promise<void> {
  const manifest = await fetchManifest(baseUrl);
  const archiveBuffer = await fetchArchive(baseUrl);
  const store = new ZipStore(archiveBuffer);
  const repo = new MRTDownRepository({ store });
  const requireHash = (
    kind: string,
    id: string,
    hash: string | undefined,
  ): string => {
    if (hash == null || hash.length === 0) {
      throw new Error(`Missing ${kind} hash in fixture manifest: ${id}`);
    }
    return hash;
  };

  await truncateStagingTables(db);

  const stations = repo.stations.list().map((station) => ({
    ...station,
    hash: requireHash('station', station.id, manifest.stations[station.id]),
  }));
  const services = repo.services.list().map((service) => ({
    ...service,
    hash: requireHash('service', service.id, manifest.services[service.id]),
  }));
  const lines = repo.lines.list().map((line) => ({
    ...line,
    hash: requireHash('line', line.id, manifest.lines[line.id]),
  }));

  const operators = repo.operators.list().map((operator) => ({
    ...operator,
    hash: requireHash('operator', operator.id, manifest.operators[operator.id]),
  }));
  await insertOperatorsStaging(db, operators);
  store.clearCache();

  const towns = repo.towns.list().map((town) => ({
    ...town,
    hash: requireHash('town', town.id, manifest.towns[town.id]),
  }));
  await insertTownsStaging(db, towns);
  store.clearCache();

  const landmarks = repo.landmarks.list().map((landmark) => ({
    ...landmark,
    hash: requireHash('landmark', landmark.id, manifest.landmarks[landmark.id]),
  }));
  await insertLandmarksStaging(db, landmarks);
  store.clearCache();

  await insertLinesStaging(db, lines);
  store.clearCache();

  const issues = repo.issues.list().map((issue) => ({
    issue: {
      ...issue.issue,
      hash: requireHash(
        'issue',
        issue.issue.id,
        manifest.issues[issue.issue.id],
      ),
    },
    evidence: issue.evidence,
    impactEvents: issue.impactEvents,
  }));
  await insertIssuesStaging(db, issues);
  store.clearCache();

  await insertStationsStaging(db, stations);
  store.clearCache();

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

  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema }) as Db;

  try {
    console.log(`Seeding preview database from ${DEFAULT_FIXTURES_BASE_URL}`);
    await stageFixtures(db, DEFAULT_FIXTURES_BASE_URL);
    await syncSeededData(db);
    const facts = await rebuildOperationalFactsRange(
      OPERATIONAL_FACTS_REBUILD_DAYS,
      undefined,
      db,
    );
    console.log(`Rebuilt operational facts for ${facts.length} preview days`);
    console.log('Preview fixture seed complete');
  } finally {
    await pool.end();
  }
}

await main();
