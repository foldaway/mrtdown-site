import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
  expire: vi.fn(),
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
const range = (
  start = now.startOf('month'),
  end = now.plus({ day: 1 }).startOf('day'),
) => getIssuesOverlappingRange(start, end, now, db);

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
    for (const migration of [
      '20260408231014_absurd_lenny_balinger',
      '20260518155031_curious_vision',
      '20260519043138_canonical_issue_periods',
      '20260521104213_busy_midnight',
      '20260529122429_spicy_zombie',
      '20260721025518_milky_absorbing_man',
      '20260721032337_soft_crystal',
      '20260721035821_sloppy_lady_deathstrike',
      '20260721133009_late_angel',
      '20260725161225_needy_mentallo',
      '20261024214325_superb_violations',
      '20261025200054_violet_energizer',
      '20261027152337_early_lilith',
      '20261108020149_combined_timetable_retention',
      '20261108050132_combined_departure_index',
    ]) {
      const sql = await readFile(
        new URL(`../../../drizzle/${migration}/migration.sql`, import.meta.url),
        'utf8',
      );
      await pool.query(sql.replaceAll('"public".', `"${schema}".`));
    }
  });
  beforeEach(async () => {
    vi.stubEnv('TIER', 'staging');
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'publish');
    vi.spyOn(database, 'getDefaultDb').mockResolvedValue(db);
    store.clear();
    vi.clearAllMocks();
    redis.getrange.mockImplementation(
      async (key: string, start: number, end: number) =>
        Buffer.from(store.get(key) ?? '')
          .subarray(start, end + 1)
          .toString(),
    );
    redis.set.mockImplementation(async (key: string, raw: string) => {
      if (store.has(key)) return null;
      store.set(key, raw);
      return 'OK';
    });
    redis.expire.mockResolvedValue(1);
    await pool.query(
      'TRUNCATE operators, towns, lines, stations, services, issues, metadata CASCADE',
    );
    const canonical = scheduledTimetableCanonicalFixture(3).canonical;
    canonical.services.push({
      ...structuredClone(canonical.services[0]),
      id: 'service-other',
    });
    canonical.lines[0].serviceIds.push('service-other');
    // Two services share the literal revision ID. A historical revision keeps its own path.
    canonical.services[0].revisions.push({
      ...structuredClone(canonical.services[0].revisions[0]),
      id: 'historical',
      startAt: '1990-01-01',
      endAt: '1999-12-31',
    });
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
    for (const [id, end] of [
      ['ended', '2026-11-18T10:30:00+08:00'],
      ['open', null],
    ]) {
      await pool.query(
        "insert into issues (id,type,title,title_meta,hash) values ($1,'disruption',$2,'{}','fixture')",
        [id, canonical.lines[0].name],
      );
      await pool.query(
        "insert into impact_events (id,ts,issue_id,type) values ($1,'2026-11-18T10:00:00+08:00',$2,'periods.set')",
        [id, id],
      );
      await pool.query(
        "insert into impact_event_periods (impact_event_id,index,start_ts,end_ts) values ($1,0,'2026-11-18T10:00:00+08:00',$2)",
        [id, end],
      );
      await pool.query(
        "insert into impact_event_entity_services (impact_event_id,service_id) values ($1,'service')",
        [id],
      );
    }
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

  it('preserves range output, effective revisions, repeated IDs and current intervals while removing path SQL', async () => {
    const baseline = await range();
    expect(pathsSql()).toHaveLength(1);
    expect(baseline.issues).toHaveLength(2);
    await publishServicePathCache(generation);
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    queries.length = 0;
    expect(await range()).toEqual(baseline);
    expect(pathsSql()).toHaveLength(0);
    expect(headers).toHaveBeenCalledWith(
      'X-MRTDown-Service-Paths-Source',
      'redis',
    );
    headers.mockClear();
    expect(await range()).toEqual(baseline);
    expect(headers).toHaveBeenCalledWith(
      'X-MRTDown-Service-Paths-Source',
      'memory',
    );
    expect(headers).not.toHaveBeenCalledWith('Cache-Control', 'no-store');
    const midnight = now.plus({ day: 1 }).startOf('day');
    const cachedNextDay = await getIssuesOverlappingRange(
      now.startOf('month'),
      midnight.plus({ day: 1 }),
      midnight,
      db,
    );
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'publish');
    expect(
      await getIssuesOverlappingRange(
        now.startOf('month'),
        midnight.plus({ day: 1 }),
        midnight,
        db,
      ),
    ).toEqual(cachedNextDay);
  });

  it('retains empty-range parity and uses SQL with no-store during partial promotion or missing cache data', async () => {
    const start = now.minus({ years: 2 });
    const end = start.plus({ day: 1 });
    const baseline = await range(start, end);
    expect(baseline.issues).toEqual([]);
    await publishServicePathCache(generation);
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    expect(await range(start, end)).toEqual(baseline);
    const expectSqlFallback = async () => {
      queries.length = 0;
      headers.mockClear();
      const result = await range(start, end);
      expect(pathsSql()).toHaveLength(1);
      expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
      vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'publish');
      expect(await range(start, end)).toEqual(result);
      vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    };
    await markPageProfilesUpdating(db);
    await expectSqlFallback();
    await completePageProfileGeneration(db, randomUUID());
    await expectSqlFallback();
  });

  it('keeps an in-flight old SQL snapshot coherent across correction and publication, then selects the correction', async () => {
    const baseline = await range();
    await publishServicePathCache(generation);
    const original = store.get(getServicePathCacheKey(generation));
    let release: (value: string) => void = () => {};
    redis.getrange.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    const inFlight = range();
    await vi.waitFor(() => expect(redis.getrange).toHaveBeenCalledOnce());
    // Commit a correction on another connection after the old snapshot read its marker.
    await pool.query(
      "update service_revision_path_station_entries set display_code='CORRECTED' where path_index=0",
    );
    const nextGeneration = randomUUID();
    await completePageProfileGeneration(db, nextGeneration);
    await publishServicePathCache(nextGeneration);
    release(original ?? '');
    expect(await inFlight).toEqual(baseline);
    const corrected = await range();
    expect(corrected).not.toEqual(baseline);
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'publish');
    expect(await range()).toEqual(corrected);
    expect(store.size).toBe(2);
  });
});
