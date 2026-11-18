import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DateTime } from 'luxon';
import { Pool } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  completePageProfileGeneration,
  markPageProfilesUpdating,
} from '~/db/pageProfileGeneration';
import { relations } from '~/db/relations';
import {
  issuesTable,
  serviceRevisionPathStationEntriesTable as paths,
} from '~/db/schema';
import {
  getServicePathCacheKey,
  publishServicePathCache,
} from '~/util/servicePathCache.server';
import { scheduledTimetableCanonicalFixture } from '~/workflows/pull/helpers/scheduledTimetableCanonical.fixture';
import * as sync from '~/workflows/pull/helpers/stagingSync';
import * as database from './database';
import { getIssuesOverlappingRange } from './issueRange';

const store = vi.hoisted(() => new Map<string, string>());
const redis = vi.hoisted(() => ({
  getrange: vi.fn(),
  set: vi.fn(),
}));
vi.mock('~/util/pageProfileRedis.server', () => ({
  getPageProfileRedis: async () => redis,
}));
const headers = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-start/server', () => ({
  setResponseHeader: headers,
  getResponseHeader: vi.fn(),
}));

const url = process.env.TEST_TIMETABLE_DATABASE_URL;
const schema = `service_paths_test_${randomUUID().replaceAll('-', '')}`;
const now = DateTime.fromISO('2026-11-18T12:00:00', { zone: 'Asia/Singapore' });
const queries: string[] = [];
let admin: Pool;
let pool: Pool;
let db: database.AppDb;
let generation: string;
const pathsSql = () =>
  queries.filter((q) =>
    q.includes('from "service_revision_path_station_entries"'),
  );
const range = () =>
  getIssuesOverlappingRange(
    now.startOf('month'),
    now.plus({ day: 1 }).startOf('day'),
    now,
    db,
  );

// Real SQL snapshots and query counts; Redis transport is deterministic for race injection.
describe.skipIf(!url)('service-path range cache with PostGIS', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema},public`,
    });
    db = drizzle({
      client: pool,
      relations,
      logger: { logQuery: (query) => queries.push(query) },
    });
    const migrationsDir = new URL('../../../drizzle/', import.meta.url);
    const migrations = (await readdir(migrationsDir))
      .filter((name) => /^\d{14}_/.test(name))
      .sort();
    for (const migration of migrations) {
      const sql = await readFile(
        new URL(`${migration}/migration.sql`, migrationsDir),
        'utf8',
      );
      await pool.query(
        sql
          .replaceAll('"public".', `"${schema}".`)
          .replaceAll("'public'", `'${schema}'`),
      );
    }
  });
  beforeEach(async () => {
    vi.stubEnv('TIER', 'staging');
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'publish');
    vi.spyOn(database, 'getDefaultDb').mockResolvedValue(db);
    store.clear();
    vi.clearAllMocks();
    redis.getrange.mockImplementation(
      async (key: string) => store.get(key) ?? '',
    );
    redis.set.mockImplementation(async (key: string, raw: string) => {
      store.set(key, raw);
      return 'OK';
    });
    await pool.query(
      'TRUNCATE operators, towns, lines, stations, services, issues, metadata CASCADE',
    );
    const canonical = scheduledTimetableCanonicalFixture(3).canonical;
    const hashed = <T>(rows: T[]) =>
      rows.map((row) => ({ ...row, hash: 'fixture' }));
    await sync.insertOperatorsStaging(db, hashed(canonical.operators));
    await sync.insertTownsStaging(
      db,
      hashed([{ id: 'town', name: canonical.operators[0].name }]),
    );
    await sync.insertLinesStaging(db, hashed(canonical.lines));
    await sync.insertStationsStaging(db, hashed(canonical.stations));
    await sync.insertServicesStaging(db, hashed(canonical.services));
    await sync.syncOperatorsTownsLandmarksUpserts(db);
    await sync.syncLines(db);
    await sync.syncStations(db);
    await sync.syncServices(db);
    await sync.finalizePull(db, { canonicalTopologyComplete: true });
    await pool.query(
      "insert into issues (id,type,title,title_meta,hash) values ('issue','disruption',$1,'{}','fixture')",
      [{ ...canonical.lines[0].name, 'en-SG': 'Original issue' }],
    );
    await pool.query(
      "insert into impact_events (id,ts,issue_id,type) values ('period','2026-11-18T10:00:00+08:00','issue','periods.set')",
    );
    await pool.query(
      "insert into impact_event_periods (impact_event_id,index,start_ts,end_ts) values ('period',0,'2026-11-18T10:00:00+08:00','2026-11-18T10:30:00+08:00')",
    );
    await pool.query(
      "insert into impact_event_entity_services (impact_event_id,service_id) values ('period','service')",
    );
    generation = randomUUID();
    await completePageProfileGeneration(db, generation);
    queries.length = 0;
    headers.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it('preserves SQL output while eliminating path queries', async () => {
    const baseline = await range();
    expect(baseline.issues).toHaveLength(1);
    expect(pathsSql()).toHaveLength(1);
    await publishServicePathCache(generation);
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    queries.length = 0;

    expect(await range()).toEqual(baseline);
    expect(pathsSql()).toHaveLength(0);
    expect(headers).not.toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('falls back to SQL with no-store during incomplete promotion', async () => {
    await publishServicePathCache(generation);
    await markPageProfilesUpdating(db);
    const baseline = await range();
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    queries.length = 0;

    expect(await range()).toEqual(baseline);
    expect(pathsSql()).toHaveLength(1);
    expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(redis.getrange).not.toHaveBeenCalled();
  });

  it('keeps old issue and path data together across publication, then reads the correction', async () => {
    const baseline = await range();
    await publishServicePathCache(generation);
    const original = store.get(getServicePathCacheKey(generation)) ?? '';
    const paused = Promise.withResolvers<string>();
    redis.getrange.mockReturnValueOnce(paused.promise);
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    const inFlight = range();
    try {
      await vi.waitFor(() => expect(redis.getrange).toHaveBeenCalledOnce());
      const nextGeneration = randomUUID();
      // Publish both changes after the pending read established its old SQL snapshot.
      await db.transaction(async (tx) => {
        await tx
          .update(paths)
          .set({ display_code: 'CORRECTED' })
          .where(eq(paths.path_index, 0));
        await tx
          .update(issuesTable)
          .set({
            title: { ...baseline.issues[0].title, 'en-SG': 'Corrected issue' },
          })
          .where(eq(issuesTable.id, 'issue'));
        await completePageProfileGeneration(tx, nextGeneration);
      });
      await publishServicePathCache(nextGeneration);
    } finally {
      paused.resolve(original);
    }

    expect(await inFlight).toEqual(baseline);
    const corrected = await range();
    expect(corrected.issues[0].title['en-SG']).toBe('Corrected issue');
    expect(
      corrected.dataset.branchByServiceId.service.entries[0].displayCode,
    ).toBe('CORRECTED');
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'publish');
    expect(await range()).toEqual(corrected);
  });
});
