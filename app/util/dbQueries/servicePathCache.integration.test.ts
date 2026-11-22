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
  stationsTable,
} from '~/db/schema';
import {
  getRangeReferenceCacheKey,
  publishRangeReferenceCache,
} from '~/util/rangeReferenceCache.server';
import { publishRangeSnapshot } from '~/util/rangeSnapshot.server';
import { rangeSnapshotStore } from '~/util/rangeSnapshotStore.server';
import {
  getServicePathCacheKey,
  publishServicePathCache,
} from '~/util/servicePathCache.server';
import { buildWeeklySummary } from '~/util/weeklyReport';
import { syncPublicHolidays } from '~/workflows/publicHolidays/helpers/syncPublicHolidays';
import { scheduledTimetableCanonicalFixture } from '~/workflows/pull/helpers/scheduledTimetableCanonical.fixture';
import * as sync from '~/workflows/pull/helpers/stagingSync';
import * as database from './database';
import { buildDataset } from './dataset';
import {
  getHistoryDayData,
  getHistoryYearMonthData,
  getHistoryYearSummaryData,
} from './history';
import { getIssuesOverlappingRange } from './issueRange';
import { rebuildOperationalFactsRange } from './operationalFacts';
import { getOverviewData, getSystemMapData } from './overview';
import { rebuildSitemapSnapshot } from './sitemap';
import { rebuildStatisticsSnapshot } from './statistics';

const store = vi.hoisted(() => new Map<string, string>());
const redis = vi.hoisted(() => ({
  getrange: vi.fn(),
  set: vi.fn(),
  expire: vi.fn(),
  eval: vi.fn(),
  del: vi.fn(),
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
const referenceSql = () =>
  queries.filter((q) =>
    /from "(?:lines|line_operators|services|service_revisions|stations|station_codes|station_landmarks)"/.test(
      q,
    ),
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
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', undefined);
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'publish');
    vi.stubEnv('REDIS_RANGE_REFERENCE_CACHE', 'publish');
    vi.setSystemTime(now.toJSDate());
    vi.spyOn(database, 'getDefaultDb').mockResolvedValue(db);
    store.clear();
    vi.clearAllMocks();
    redis.getrange.mockImplementation(
      async (key: string) => store.get(key) ?? '',
    );
    redis.set.mockImplementation(
      async (key: string, raw: string, ...args: unknown[]) => {
        if (args.includes('NX') && store.has(key)) return null;
        store.set(key, raw);
        return 'OK';
      },
    );
    redis.expire.mockResolvedValue(1);
    redis.del.mockImplementation(async (key: string) =>
      Number(store.delete(key)),
    );
    redis.eval.mockImplementation(
      async (
        _script,
        _count,
        active,
        key,
        _previous,
        expected,
        next,
        _retention,
        encoded,
      ) => {
        if ((store.get(active) ?? '') !== expected) return 0;
        store.set(key, encoded);
        store.set(active, next);
        return 1;
      },
    );
    await pool.query(
      'TRUNCATE operators, towns, landmarks, lines, stations, services, issues, metadata, public_holidays CASCADE',
    );
    const canonical = scheduledTimetableCanonicalFixture(3).canonical;
    canonical.lines[0].operatingHours = {
      weekdays: { start: '05:00:00', end: '23:00:00' },
      weekends: { start: '06:00:00', end: '22:00:00' },
    };
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
      "insert into landmarks (id,name,hash) values ('z', $1,'fixture'),('a',$1,'fixture')",
      [canonical.lines[0].name],
    );
    await pool.query(
      "insert into station_landmarks (station_id,landmark_id) values ('station-1','z'),('station-1','a')",
    );
    await pool.query(
      "update stations set first_last_train = $1 where id='station-1'",
      [
        {
          services: [
            {
              serviceId: 'service',
              times: {
                daily: { firstTrain: '05:00:00', lastTrain: '23:00:00' },
              },
            },
          ],
        },
      ],
    );
    await pool.query(
      "insert into station_codes (line_id,station_id,code,started_at,structure_type) values ('line','station-1','LEGACY','1990-01-01','underground')",
    );
    await pool.query(
      "insert into public_holidays (id,date,holiday_name,hash) values ('holiday','2026-11-18','Holiday','fixture')",
    );
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
    vi.useRealTimers();
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it('serves a published range at different request clocks with no database accessor', async () => {
    const clocks = [now.minus({ hours: 2 }), now, now.plus({ days: 1 })];
    const expected = [];
    for (const clock of clocks)
      expected.push(
        await getIssuesOverlappingRange(
          clock.startOf('day'),
          clock.plus({ days: 1 }).startOf('day'),
          clock,
          db,
        ),
      );
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'publish');
    await publishRangeSnapshot('a'.repeat(64));
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'enabled');
    vi.spyOn(database, 'getDefaultDb').mockRejectedValue(
      Error('SQL must stay asleep'),
    );
    queries.length = 0;
    for (const [index, clock] of clocks.entries()) {
      expect(
        await getIssuesOverlappingRange(
          clock.startOf('day'),
          clock.plus({ days: 1 }).startOf('day'),
          clock,
        ),
      ).toEqual(expected[index]);
    }
    expect(queries).toEqual([]);
    expect(headers).not.toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('recomputes open intervals and service revisions across midnight without republishing', async () => {
    await pool.query(
      "update service_revisions set end_at='2026-11-19' where id='revision'",
    );
    await pool.query(
      "insert into service_revisions (id,service_id,start_at,end_at,operating_hours) select 'next',service_id,'2026-11-19',null,operating_hours from service_revisions where id='revision'",
    );
    await pool.query(
      "insert into service_revision_path_station_entries (service_revision_id,service_id,station_id,display_code,path_index) select 'next',service_id,station_id,display_code || 'N',path_index from service_revision_path_station_entries where service_revision_id='revision'",
    );
    await pool.query('update impact_event_periods set end_ts=null');
    const at = (clock: DateTime) =>
      getIssuesOverlappingRange(
        clock.startOf('day'),
        clock.plus({ days: 1 }).startOf('day'),
        clock,
        db,
      );
    const expected = [await at(now), await at(now.plus({ days: 1 }))];
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'publish');
    await publishRangeSnapshot('a'.repeat(64));
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'enabled');
    queries.length = 0;
    expect(await at(now)).toEqual(expected[0]);
    const tomorrow = await at(now.plus({ days: 1 }));
    expect(tomorrow).toEqual(expected[1]);
    expect(
      tomorrow.dataset.branchByServiceId.service.entries[0].displayCode,
    ).toBe('T1N');
    expect(tomorrow.issues).toHaveLength(1);
    expect(queries).toEqual([]);
  });

  it('uses only the latest corrected periods, including timestamp ties, for published range selection', async () => {
    await pool.query(
      "insert into impact_events (id,ts,issue_id,type) values ('period-z','2026-11-18T10:00:00+08:00','issue','periods.set')",
    );
    await pool.query(
      "insert into impact_event_periods (impact_event_id,index,start_ts,end_ts) values ('period-z',0,'2026-12-01T10:00:00+08:00','2026-12-01T11:00:00+08:00')",
    );
    const baseline = await range();
    expect(baseline.issues).toEqual([]);
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'publish');
    await publishRangeSnapshot('a'.repeat(64));
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'enabled');
    queries.length = 0;
    expect(await range()).toEqual(baseline);
    expect(queries).toEqual([]);
  });

  it('keeps the complete published source during promotion and switches issue/path corrections together', async () => {
    const baseline = await range();
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'publish');
    await publishRangeSnapshot('a'.repeat(64));
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'enabled');
    await markPageProfilesUpdating(db);
    await db
      .update(paths)
      .set({ display_code: 'CORRECTED' })
      .where(eq(paths.path_index, 0));
    await db.update(issuesTable).set({
      title: { ...baseline.issues[0].title, 'en-SG': 'Corrected issue' },
    });
    queries.length = 0;
    expect(await range()).toEqual(baseline);
    expect(queries).toEqual([]);
    await expect(publishRangeSnapshot('b'.repeat(64))).rejects.toThrow(
      'completed canonical',
    );
    await completePageProfileGeneration(db, randomUUID());
    await publishRangeSnapshot('b'.repeat(64));
    queries.length = 0;
    const corrected = await range();
    expect(corrected.issues[0].title['en-SG']).toBe('Corrected issue');
    expect(
      corrected.dataset.branchByServiceId.service.entries[0].displayCode,
    ).toBe('CORRECTED');
    expect(queries).toEqual([]);
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', '');
    expect(await range()).toEqual(corrected);
  });

  it('republishes independent holiday changes and preserves zero-SQL overview/history output', async () => {
    const outputs = async () => ({
      overview: await getOverviewData(30),
      month: await getHistoryYearMonthData(2026, 11),
    });
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'publish');
    const before = await outputs();
    await publishRangeSnapshot('a'.repeat(64));
    const original = (await rangeSnapshotStore.head()).value?.sha256;
    await pool.query('delete from public_holidays');
    const expected = await outputs();
    expect(expected.overview).not.toEqual(before.overview);
    await publishRangeSnapshot('a'.repeat(64));
    expect((await rangeSnapshotStore.head()).value?.sha256).not.toBe(original);
    vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'enabled');
    queries.length = 0;
    expect(await outputs()).toEqual(expected);
    expect(queries).toEqual([]);
  });

  it.each(['missing', 'invalid', 'unavailable'] as const)(
    'recovers through SQL with no-store for %s published head',
    async (failure) => {
      const baseline = await range();
      vi.stubEnv('REDIS_RANGE_SNAPSHOT', 'enabled');
      if (failure === 'invalid')
        store.set('mrtdown:{staging:range-snapshot:v1}:active', '{}');
      if (failure === 'unavailable')
        redis.getrange.mockRejectedValueOnce(Error('unavailable'));
      queries.length = 0;
      expect(await range()).toEqual(baseline);
      expect(queries.length).toBeGreaterThan(0);
      expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
    },
  );

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

  it.each([
    ['enabled', 'enabled', 0, 0],
    ['enabled', '', 0, 7],
    ['', 'enabled', 1, 0],
    ['', '', 1, 7],
  ] as const)(
    'preserves range output with path=%s and references=%s',
    async (pathFlag, referenceFlag, pathQueries, referenceQueries) => {
      const baseline = await range();
      const complete = await buildDataset(now, db, ['issue']);
      expect(baseline.dataset).toEqual({
        ...complete,
        metadata: {},
        included: {
          ...complete.included,
          operators: {},
          towns: {},
          landmarks: {},
        },
      });
      expect(
        baseline.dataset.included.stations['station-1'].landmarkIds,
      ).toEqual(['z', 'a']);
      await publishServicePathCache(generation);
      await publishRangeReferenceCache(generation);
      vi.stubEnv('REDIS_SERVICE_PATH_CACHE', pathFlag);
      vi.stubEnv('REDIS_RANGE_REFERENCE_CACHE', referenceFlag);
      queries.length = 0;
      expect(await range()).toEqual(baseline);
      expect(pathsSql()).toHaveLength(pathQueries);
      expect(referenceSql()).toHaveLength(referenceQueries);
      expect(queries.filter((q) => q.includes('from "metadata"'))).toHaveLength(
        pathFlag || referenceFlag ? 1 : 0,
      );
      expect(
        queries.filter((q) => q.includes('from "public_holidays"')),
      ).toHaveLength(1);
      expect(
        queries.some((q) => /from "(?:operators|towns|landmarks)"/.test(q)),
      ).toBe(false);
    },
  );

  it('preserves overview/map, history/API and weekly summary output across SQL, cold and warm cache reads', async () => {
    const outputs = async () => {
      const result = await range();
      return {
        overview: await getOverviewData(30),
        map: await getSystemMapData(),
        year: await getHistoryYearSummaryData(2026),
        month: await getHistoryYearMonthData(2026, 11),
        day: await getHistoryDayData(2026, 11, 18),
        weekly: buildWeeklySummary(
          result.issues,
          result.dataset.included.lines,
          now.startOf('week'),
          now,
          now,
          result.dataset.included.stations,
        ),
      };
    };
    const baseline = await outputs();
    await publishServicePathCache(generation);
    await publishRangeReferenceCache(generation);
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    vi.stubEnv('REDIS_RANGE_REFERENCE_CACHE', 'enabled');
    expect(await outputs()).toEqual(baseline);
    queries.length = 0;
    expect(await outputs()).toEqual(baseline);
    expect(referenceSql()).toHaveLength(0);
    expect(pathsSql()).toHaveLength(0);
  });

  it.each([
    'missing',
    'partial',
    'oversized',
    'unavailable',
    'updating',
  ] as const)(
    'falls back coherently with no-store for %s references while paths can still hit',
    async (failure) => {
      const baseline = await range();
      await publishServicePathCache(generation);
      await publishRangeReferenceCache(generation);
      const key = getRangeReferenceCacheKey(generation);
      if (failure === 'missing') store.delete(key);
      if (failure === 'partial')
        store.set(
          key,
          JSON.stringify({ version: 1, generation, rows: { stations: [] } }),
        );
      if (failure === 'oversized') store.set(key, 'x'.repeat(512 * 1024 + 1));
      if (failure === 'updating') await markPageProfilesUpdating(db);
      if (failure === 'unavailable')
        redis.getrange.mockImplementation(async (requested) => {
          if (requested === key) throw Error('Redis timeout');
          return store.get(requested) ?? '';
        });
      vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
      vi.stubEnv('REDIS_RANGE_REFERENCE_CACHE', 'enabled');
      queries.length = 0;
      headers.mockClear();
      expect(await range()).toEqual(baseline);
      expect(referenceSql()).toHaveLength(7);
      expect(pathsSql()).toHaveLength(failure === 'updating' ? 1 : 0);
      expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
    },
  );

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

  it('keeps holidays and live issue corrections current without invalidating references, including manual facts rebuilds', async () => {
    await publishServicePathCache(generation);
    await publishRangeReferenceCache(generation);
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    vi.stubEnv('REDIS_RANGE_REFERENCE_CACHE', 'enabled');
    await range();
    expect(
      (await getOverviewData(30)).data.lineSummaries[0].breakdownByDates[
        '2026-11-18'
      ].dayType,
    ).toBe('public_holiday');
    await syncPublicHolidays(db, [
      {
        id: 'previous-holiday',
        date: '2026-11-17',
        holidayName: 'Previous holiday',
        hash: 'changed',
      },
      {
        id: 'new-holiday',
        date: '2026-11-19',
        holidayName: 'New holiday',
        hash: 'changed',
      },
    ]);
    await pool.query("update issues set title = $1 where id='issue'", [
      { 'en-SG': 'Live correction', 'zh-Hans': null, ms: null, ta: null },
    ]);
    queries.length = 0;
    const changed = await range();
    expect(changed.dataset.publicHolidaySet.has('2026-11-19')).toBe(true);
    expect(changed.dataset.publicHolidaySet.has('2026-11-18')).toBe(false);
    expect(
      (await getOverviewData(30)).data.lineSummaries[0].breakdownByDates[
        '2026-11-18'
      ].dayType,
    ).toBe('weekday');
    expect(changed.issues[0].title['en-SG']).toBe('Live correction');
    expect(referenceSql()).toHaveLength(0);
    await rebuildOperationalFactsRange(1);
    await rebuildStatisticsSnapshot();
    await rebuildSitemapSnapshot();
    queries.length = 0;
    expect(await range()).toEqual(changed);
    expect(referenceSql()).toHaveLength(0);
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it('assembles revision boundaries at request time and preserves empty ranges', async () => {
    await pool.query(
      "update service_revisions set end_at='2026-11-19' where id='revision'",
    );
    await pool.query(
      "insert into service_revisions (id,service_id,start_at,end_at,operating_hours) select 'next',service_id,'2026-11-19',null,operating_hours from service_revisions where id='revision'",
    );
    await pool.query(
      "insert into service_revision_path_station_entries (service_revision_id,service_id,station_id,display_code,path_index) select 'next',service_id,station_id,display_code || 'N',path_index from service_revision_path_station_entries where service_revision_id='revision'",
    );
    await publishServicePathCache(generation);
    await publishRangeReferenceCache(generation);
    for (const reference of [now, now.plus({ days: 1 })]) {
      const readAt = () =>
        getIssuesOverlappingRange(
          reference.startOf('day'),
          reference.plus({ days: 1 }).startOf('day'),
          reference,
          db,
        );
      const baseline = await readAt();
      vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
      vi.stubEnv('REDIS_RANGE_REFERENCE_CACHE', 'enabled');
      const cached = await readAt();
      expect(cached).toEqual(baseline);
      expect(
        cached.dataset.branchByServiceId.service.entries[0].displayCode,
      ).toBe(reference.day === now.day ? 'T1' : 'T1N');
      if (reference.day !== now.day) expect(cached.issues).toEqual([]);
      vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'publish');
      vi.stubEnv('REDIS_RANGE_REFERENCE_CACHE', 'publish');
    }
  });

  it('preserves whole-service historical revisions and facility-only affected memberships', async () => {
    await pool.query(
      "insert into service_revisions (id,service_id,start_at,end_at,operating_hours) select 'historical',service_id,'1990-01-01','2000-01-01',operating_hours from service_revisions where id='revision'",
    );
    await pool.query(
      "insert into service_revision_path_station_entries (service_revision_id,service_id,station_id,display_code,path_index) values ('historical','service','station-3','H1',0)",
    );
    await pool.query(
      "insert into impact_events (id,ts,issue_id,type) values ('whole','2026-11-18T10:00:00Z','issue','service_scopes.set')",
    );
    await pool.query(
      "insert into impact_event_entity_services (impact_event_id,service_id) values ('whole','service')",
    );
    await pool.query(
      "insert into impact_event_service_scopes (impact_event_id,index,type) values ('whole',0,'service.whole')",
    );
    await pool.query(
      "insert into issues (id,type,title,title_meta,hash) select 'facility','infra',title,title_meta,hash from issues where id='issue'",
    );
    await pool.query(
      "insert into impact_events (id,ts,issue_id,type) values ('facility-period','2026-11-18T10:00:00Z','facility','periods.set')",
    );
    await pool.query(
      "insert into impact_event_periods (impact_event_id,index,start_ts,end_ts) values ('facility-period',0,'2026-11-18T10:00:00+08:00','2026-11-18T10:30:00+08:00')",
    );
    await pool.query(
      "insert into impact_event_entity_facilities (impact_event_id,station_id,line_id,kind) values ('facility-period','station-1','line','lift')",
    );
    const baseline = await range();
    expect(
      baseline.dataset.allIssues.issue.branchesAffected[0]
        .wholeServiceRevisions,
    ).toHaveLength(2);
    expect(
      baseline.dataset.allIssues.facility.branchesAffected[0].stationIds,
    ).toEqual(['station-1']);
    await publishServicePathCache(generation);
    await publishRangeReferenceCache(generation);
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    vi.stubEnv('REDIS_RANGE_REFERENCE_CACHE', 'enabled');
    expect(await range()).toEqual(baseline);
  });

  it('keeps old issue and path data together across publication, then reads the correction', async () => {
    const baseline = await range();
    await publishServicePathCache(generation);
    await publishRangeReferenceCache(generation);
    const original = store.get(getServicePathCacheKey(generation)) ?? '';
    const paused = Promise.withResolvers<string>();
    redis.getrange.mockReturnValueOnce(paused.promise);
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'enabled');
    vi.stubEnv('REDIS_RANGE_REFERENCE_CACHE', 'enabled');
    const inFlight = range();
    try {
      await vi.waitFor(() => expect(redis.getrange).toHaveBeenCalledTimes(2));
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
        await tx
          .update(stationsTable)
          .set({
            name: {
              ...baseline.dataset.included.stations['station-1'].name,
              'en-SG': 'Corrected station',
            },
          })
          .where(eq(stationsTable.id, 'station-1'));
        await completePageProfileGeneration(tx, nextGeneration);
      });
      await publishServicePathCache(nextGeneration);
      await publishRangeReferenceCache(nextGeneration);
    } finally {
      paused.resolve(original);
    }

    expect(await inFlight).toEqual(baseline);
    const corrected = await range();
    expect(corrected.issues[0].title['en-SG']).toBe('Corrected issue');
    expect(corrected.dataset.included.stations['station-1'].name['en-SG']).toBe(
      'Corrected station',
    );
    expect(
      corrected.dataset.branchByServiceId.service.entries[0].displayCode,
    ).toBe('CORRECTED');
    vi.stubEnv('REDIS_SERVICE_PATH_CACHE', 'publish');
    vi.stubEnv('REDIS_RANGE_REFERENCE_CACHE', 'publish');
    expect(await range()).toEqual(corrected);
  });
});
