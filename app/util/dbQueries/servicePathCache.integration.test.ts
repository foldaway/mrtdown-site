import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import Redis from 'ioredis';
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
import * as signalCache from '~/util/communitySignalCache.server';
import {
  dispatchPendingCrowdReports,
  getDispatchableCrowdReportCandidates,
} from '~/util/crowdReportDispatch';
import {
  automoderateCrowdReport,
  type CrowdReportSubmission,
  findProgrammaticCrowdReportRetry,
  getPublicCrowdReportSignals,
  persistAutomoderatedCrowdReport,
  persistAutomoderatedProgrammaticCrowdReport,
  persistCrowdReport,
} from '~/util/crowdReports';
import * as redisConnection from '~/util/pageProfileRedis.server';
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
import { buildSitemapPaths } from '~/util/sitemap.functions';
import { sitemapSnapshotStore } from '~/util/sitemapSnapshot.server';
import { buildWeeklySummary } from '~/util/weeklyReport';
import {
  canSkipPublicHolidaySync,
  completePublicHolidaySync,
} from '~/workflows/publicHolidays/helpers/syncCheckpoint';
import {
  normalizeDataGovPublicHolidayRecord,
  syncPublicHolidays,
} from '~/workflows/publicHolidays/helpers/syncPublicHolidays';
import { recordCanonicalManifestFingerprint } from '~/workflows/pull/helpers/manifestFingerprint';
import { scheduledTimetableCanonicalFixture } from '~/workflows/pull/helpers/scheduledTimetableCanonical.fixture';
import * as sync from '~/workflows/pull/helpers/stagingSync';
import {
  acquireOrRenewPullWorkflowLease,
  releasePullWorkflowLease,
} from '~/workflows/pull/helpers/workflowLease';
import { getPageCommunitySignals } from './communitySignals';
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
import {
  getSitemapData,
  publishSitemapSnapshot,
  rebuildSitemapSnapshot,
} from './sitemap';
import { rebuildStatisticsSnapshot } from './statistics';

const store = vi.hoisted(() => new Map<string, string>());
const redis = vi.hoisted(() => ({
  getrange: vi.fn(),
  getrangeBuffer: vi.fn(),
  set: vi.fn(),
  expire: vi.fn(),
  eval: vi.fn(),
  del: vi.fn(),
}));
vi.mock('~/util/pageProfileRedis.server', () => ({
  getPageProfileRedis: vi.fn(async () => redis),
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
    vi.stubEnv('REDIS_URL', 'redis://unused');
    vi.mocked(redisConnection.getPageProfileRedis).mockResolvedValue(
      redis as unknown as Redis,
    );

    vi.setSystemTime(now.toJSDate());
    vi.spyOn(database, 'getDefaultDb').mockResolvedValue(db);
    store.clear();
    vi.clearAllMocks();
    redis.getrange.mockImplementation(
      async (key: string) => store.get(key) ?? '',
    );
    redis.getrangeBuffer.mockImplementation(async (key: string) =>
      Buffer.from(store.get(key) ?? ''),
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
        if (!Buffer.from(store.get(active) ?? '').equals(Buffer.from(expected)))
          return 0;
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
    await publishRangeSnapshot('a'.repeat(64));
    vi.spyOn(database, 'getDefaultDb').mockRejectedValue(
      Error('SQL must stay asleep'),
    );
    queries.length = 0;
    headers.mockClear();
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
    await publishRangeSnapshot('a'.repeat(64));
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
    await publishRangeSnapshot('a'.repeat(64));
    queries.length = 0;
    expect(await range()).toEqual(baseline);
    expect(queries).toEqual([]);
  });

  it('keeps the complete published source during promotion and switches issue/path corrections together', async () => {
    const baseline = await range();
    await recordCanonicalManifestFingerprint(db, 'a'.repeat(64));
    await publishRangeSnapshot();
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
    await expect(publishRangeSnapshot()).rejects.toThrow('completed canonical');
    await completePageProfileGeneration(db, randomUUID());
    await recordCanonicalManifestFingerprint(db, 'b'.repeat(64));
    await publishRangeSnapshot();
    queries.length = 0;
    const corrected = await range();
    expect(corrected.issues[0].title['en-SG']).toBe('Corrected issue');
    expect(
      corrected.dataset.branchByServiceId.service.entries[0].displayCode,
    ).toBe('CORRECTED');
    expect(queries).toEqual([]);

    vi.stubEnv('REDIS_URL', undefined);
    expect(await range()).toEqual(corrected);
  });

  it('republishes independent holiday changes and preserves zero-SQL overview/history output', async () => {
    const outputs = async () => ({
      overview: await getOverviewData(30),
      month: await getHistoryYearMonthData(2026, 11),
    });
    const before = await outputs();
    await publishRangeSnapshot('a'.repeat(64));
    const original = (await rangeSnapshotStore.head()).value?.sha256;
    await pool.query('delete from public_holidays');
    vi.stubEnv('REDIS_URL', undefined);
    const expected = await outputs();
    vi.stubEnv('REDIS_URL', 'redis://unused');
    vi.mocked(redisConnection.getPageProfileRedis).mockResolvedValue(
      redis as unknown as Redis,
    );
    expect(expected.overview).not.toEqual(before.overview);
    await publishRangeSnapshot('a'.repeat(64));
    expect((await rangeSnapshotStore.head()).value?.sha256).not.toBe(original);
    queries.length = 0;
    expect(await outputs()).toEqual(expected);
    expect(queries).toEqual([]);
  });

  it.each(['missing', 'invalid', 'unavailable'] as const)(
    'recovers through SQL with no-store for %s published head',
    async (failure) => {
      const baseline = await range();
      if (failure === 'invalid')
        store.set('mrtdown:{staging:range-snapshot:v1}:active', '{}');
      if (failure === 'unavailable')
        redis.getrangeBuffer.mockRejectedValueOnce(Error('unavailable'));
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
    queries.length = 0;

    expect(await range()).toEqual(baseline);
    expect(pathsSql()).toHaveLength(0);
    expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('preserves range output with both path and reference inputs cached', async () => {
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
    expect(baseline.dataset.included.stations['station-1'].landmarkIds).toEqual(
      ['z', 'a'],
    );
    await publishServicePathCache(generation);
    await publishRangeReferenceCache(generation);
    queries.length = 0;
    expect(await range()).toEqual(baseline);
    expect(pathsSql()).toHaveLength(0);
    expect(referenceSql()).toHaveLength(0);
    expect(queries.filter((q) => q.includes('from "metadata"'))).toHaveLength(
      1,
    );
    expect(
      queries.filter((q) => q.includes('from "public_holidays"')),
    ).toHaveLength(1);
    expect(
      queries.some((q) => /from "(?:operators|towns|landmarks)"/.test(q)),
    ).toBe(false);
  });

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
    queries.length = 0;

    expect(await range()).toEqual(baseline);
    expect(pathsSql()).toHaveLength(1);
    expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(redis.getrange).not.toHaveBeenCalled();
  });

  it('retains holiday fact repairs across committed retries and serializes every holiday writer', async () => {
    vi.useRealTimers(); // SQL lease expiry compares against the database clock.
    const rows = [
      normalizeDataGovPublicHolidayRecord({
        date: '2026-11-17',
        holiday: 'First',
      }),
      normalizeDataGovPublicHolidayRecord({
        date: '2026-11-19',
        holiday: 'Last',
      }),
    ];
    expect(await acquireOrRenewPullWorkflowLease(db, 'other-writer')).toBe(
      true,
    );
    await expect(syncPublicHolidays(db, rows)).rejects.toThrow(
      'workflow lease',
    );
    expect(redis.set).not.toHaveBeenCalled();
    await releasePullWorkflowLease(db, 'other-writer');

    const first = await syncPublicHolidays(db, rows);
    expect(first.changedDates).toEqual([
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
    ]);
    // Simulate a crash after commit, before the facts step. A new, narrower
    // source must still recover the deletion and dates from the earlier source.
    const retry = await syncPublicHolidays(db, [rows[1]]);
    expect(retry.changedDates).toEqual(first.changedDates);
    expect(retry.deleted).toBe(0);
    await expect(
      completePublicHolidaySync(first.checkpointToken, rows),
    ).rejects.toThrow('superseded');
    expect(await canSkipPublicHolidaySync([rows[1]])).toBe(false);

    // Direct/seed writes invalidate old receipts before changing SQL.
    await publishRangeSnapshot('a'.repeat(64));
    await completePublicHolidaySync(retry.checkpointToken, [rows[1]]);
    expect(await canSkipPublicHolidaySync([rows[1]])).toBe(true);

    vi.stubEnv('REDIS_URL', 'redis://unused');
    vi.mocked(redisConnection.getPageProfileRedis).mockResolvedValue(
      redis as unknown as Redis,
    );
    await syncPublicHolidays(db, [rows[1]]);
    expect(await canSkipPublicHolidaySync([rows[1]])).toBe(false);
  });

  it('keeps holidays and live issue corrections current without invalidating references, including manual facts rebuilds', async () => {
    await publishServicePathCache(generation);
    await publishRangeReferenceCache(generation);
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
    expect(
      redis.set.mock.calls.filter(
        ([key]) =>
          key === getServicePathCacheKey(generation) ||
          key === getRangeReferenceCacheKey(generation),
      ),
    ).toHaveLength(2);
  });

  it('serves sitemap paths from cold/warm published inputs across Singapore midnight without SQL', async () => {
    const fingerprint = 'a'.repeat(64);
    await pool.query(
      "update service_revisions set end_at='2026-11-19' where id='revision'",
    );
    await pool.query(
      "update impact_event_periods set end_ts='2026-11-19T00:00:00+08:00' where impact_event_id='period'",
    );
    await rebuildSitemapSnapshot();
    const baseline = await getSitemapData();
    expect(baseline).toMatchObject({
      issueIds: ['issue'],
      townIds: ['town'],
      operatorIds: ['operator'],
      stationIds: ['station-1', 'station-2', 'station-3'],
      reportEarliestDate: '2026-11-18',
    });
    await publishSitemapSnapshot(fingerprint);
    // A revision change and an ended issue do not remove their canonical URLs.
    for (const clock of [
      now,
      now.plus({ days: 1 }),
      DateTime.fromISO('2027-01-04T00:01:00+08:00'),
    ]) {
      vi.setSystemTime(clock.toJSDate());
      vi.stubEnv('REDIS_URL', undefined);
      const sql = await getSitemapData();
      vi.stubEnv('REDIS_URL', 'redis://unused');
      vi.mocked(redisConnection.getPageProfileRedis).mockResolvedValue(
        redis as unknown as Redis,
      );
      vi.mocked(database.getDefaultDb).mockRejectedValue(
        Error('SQL must stay asleep'),
      );
      queries.length = 0;
      expect(await getSitemapData()).toEqual(sql);
      expect(buildSitemapPaths(await getSitemapData())).toEqual(
        buildSitemapPaths(sql),
      );
      expect(queries).toEqual([]);
      vi.mocked(database.getDefaultDb).mockResolvedValue(db);
    }
  });

  it('retains the completed sitemap through partial promotion, then publishes corrections and authoritative emptiness', async () => {
    await recordCanonicalManifestFingerprint(db, 'b'.repeat(64));
    await publishSitemapSnapshot();
    const baseline = await getSitemapData();
    const head = (await sitemapSnapshotStore.head()).raw;
    await markPageProfilesUpdating(db);
    await pool.query("delete from issues where id='issue'");
    await expect(publishSitemapSnapshot()).rejects.toThrow(
      'completed canonical inputs',
    );
    expect((await sitemapSnapshotStore.head()).raw).toEqual(head);
    expect(await getSitemapData()).toEqual(baseline);
    await completePageProfileGeneration(db, 'corrected');
    await rebuildSitemapSnapshot();
    // The facts rebuild's publication can update the head without a new pull.
    await publishSitemapSnapshot();
    vi.setSystemTime(DateTime.fromISO('2027-01-01T00:01:00+08:00').toJSDate());
    vi.mocked(database.getDefaultDb).mockRejectedValue(
      Error('SQL must stay asleep'),
    );
    for (let read = 0; read < 2; read++) {
      expect(await getSitemapData()).toMatchObject({
        issueIds: [],
        reportEarliestDate: null,
        monthEarliest: '2027-01-01',
        monthLatest: '2027-01-01',
        currentDate: '2027-01-01',
      });
    }
  });

  it('lazily recovers missing, corrupt or unavailable sitemap inputs through the SQL snapshot', async () => {
    await rebuildSitemapSnapshot();
    const baseline = await getSitemapData();
    for (const failure of ['missing', 'corrupt', 'unavailable']) {
      store.clear();
      if (failure === 'corrupt')
        store.set('mrtdown:{staging:sitemap:v1}:active', '{}');
      if (failure === 'unavailable')
        redis.getrangeBuffer.mockRejectedValueOnce(Error('Redis unavailable'));
      queries.length = 0;
      expect(await getSitemapData()).toEqual(baseline);
      expect(
        queries.filter((q) => q.includes('from "sitemap_snapshots"')),
      ).toHaveLength(1);
    }
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
      vi.stubEnv('REDIS_URL', undefined);
      const baseline = await readAt();
      vi.stubEnv('REDIS_URL', 'redis://unused');
      vi.mocked(redisConnection.getPageProfileRedis).mockResolvedValue(
        redis as unknown as Redis,
      );
      const cached = await readAt();
      expect(cached).toEqual(baseline);
      expect(
        cached.dataset.branchByServiceId.service.entries[0].displayCode,
      ).toBe(reference.day === now.day ? 'T1' : 'T1N');
      if (reference.day !== now.day) expect(cached.issues).toEqual([]);
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
    expect(await range()).toEqual(baseline);
  });

  it('keeps old issue and path data together across publication, then reads the correction', async () => {
    const baseline = await range();
    await publishServicePathCache(generation);
    await publishRangeReferenceCache(generation);
    const original = store.get(getServicePathCacheKey(generation)) ?? '';
    const paused = Promise.withResolvers<string>();
    redis.getrange.mockReturnValueOnce(paused.promise);
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

    vi.stubEnv('REDIS_URL', undefined);
    expect(await range()).toEqual(corrected);
  });
  describe.skipIf(!process.env.TEST_SNAPSHOT_REDIS_URL)(
    'public community signals with Redis',
    () => {
      let liveRedis: Redis;
      let tier: string;
      const submission = (stationId = 'station-1'): CrowdReportSubmission => ({
        reportScope: 'line',
        lineIds: ['line'],
        stationIds: [stationId],
        observedAt: now.toJSDate().toISOString(),
        effect: 'delay',
        isStillHappening: true,
      });
      const abuse = (id: string) => ({
        ipHash: `private-ip-${id}`,
        turnstileOutcome: 'passed',
      });
      const page = () => getOverviewData(30, { includeCommunitySignals: true });
      const sqlSignals = (scope = {}) =>
        getPublicCrowdReportSignals(db, {
          includeUnconfirmedClusters: true,
          minReportCount: 1,
          minDistinctIpHashes: 1,
          ...scope,
        });
      beforeEach(async () => {
        tier = `community_test_${randomUUID().replaceAll('-', '')}`;
        vi.stubEnv('TIER', tier);
        vi.stubEnv('REDIS_URL', process.env.TEST_SNAPSHOT_REDIS_URL);
        const redisUrl = process.env.TEST_SNAPSHOT_REDIS_URL;
        if (!redisUrl) throw Error('TEST_SNAPSHOT_REDIS_URL missing');
        liveRedis = new Redis(redisUrl, {
          lazyConnect: true,
        });
        await liveRedis.connect();
        vi.spyOn(redisConnection, 'getPageProfileRedis').mockResolvedValue(
          liveRedis,
        );
        await pool.query(
          'TRUNCATE crowd_reports, crowd_report_clusters CASCADE',
        );
        await publishRangeSnapshot('a'.repeat(64));
      });
      afterEach(async () => {
        const keys = await liveRedis.keys(`mrtdown:*${tier}*`);
        if (keys.length) await liveRedis.del(...keys);
        await liveRedis.quit();
      });

      it('serves the whole homepage cold/warm and initialized-empty with SQL disabled, then expires by request clock', async () => {
        await signalCache.repairCommunitySignalCache(db);
        const empty = await page();
        expect(empty.data.communitySignals).toEqual([]);
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        queries.length = 0;
        expect(await page()).toEqual(empty);
        expect(await page()).toEqual(empty);
        // Reload the readers to discard all process-local snapshot state.
        vi.resetModules();
        const coldRedisConnection = await import(
          '~/util/pageProfileRedis.server'
        );
        vi.spyOn(coldRedisConnection, 'getPageProfileRedis').mockResolvedValue(
          liveRedis,
        );
        const coldDatabase = await import('./database');
        vi.spyOn(coldDatabase, 'getDefaultDb').mockRejectedValue(
          Error('Cold SQL must stay asleep'),
        );
        const coldOverview = await import('./overview');
        expect(
          await coldOverview.getOverviewData(30, {
            includeCommunitySignals: true,
          }),
        ).toEqual(empty);
        const coldSignals = await import('./communitySignals');
        await persistAutomoderatedCrowdReport(db, submission(), abuse('one'), {
          now,
        });
        const expected = await sqlSignals();
        expect(expected).toHaveLength(1);
        for (let read = 0; read < 2; read++) {
          expect((await page()).data.communitySignals).toEqual(expected);
          expect(
            (
              await coldOverview.getOverviewData(30, {
                includeCommunitySignals: true,
              })
            ).data.communitySignals,
          ).toEqual(expected);
        }
        for (const scope of [
          { lineId: 'line' },
          { stationId: 'station-1' },
          { stationId: 'station-2' },
        ]) {
          expect(
            await coldSignals.getPageCommunitySignals(
              { includeCommunitySignals: true },
              scope,
            ),
          ).toEqual(await sqlSignals(scope));
        }
        const raw = await liveRedis.get(
          signalCache.getCommunitySignalCacheKey(),
        );
        expect(raw).not.toContain('private-ip');
        expect(raw).not.toContain('producer');
        expect(
          await liveRedis.ttl(signalCache.getCommunitySignalCacheKey()),
        ).toBe(-1);
        queries.length = 0;
        for (const clock of [
          now.plus({ minutes: 90 }),
          now.plus({ minutes: 90, milliseconds: 1 }),
        ]) {
          vi.setSystemTime(clock.toJSDate());
          expect(
            (
              await coldOverview.getOverviewData(30, {
                includeCommunitySignals: true,
              })
            ).data.communitySignals,
          ).toEqual(
            clock.toMillis() === now.plus({ minutes: 90 }).toMillis()
              ? expected
              : [],
          );
        }
        expect(queries).toEqual([]);
      });

      it('preserves confidence, producer eligibility, scope-before-limit and SQL ordering', async () => {
        // More than a page of clusters prevents an accidental global top-20 cache.
        for (let index = 0; index < 28; index++) {
          const id = `cluster-${index.toString().padStart(2, '0')}`;
          await pool.query(
            "insert into crowd_report_clusters (id,effect,window_start_at,window_end_at) values ($1,'delay',$2,$2)",
            [id, now.toISO()],
          );
          if (index !== 23)
            await pool.query(
              'insert into crowd_report_cluster_stations (cluster_id,station_id) values ($1,$2)',
              [id, index === 27 ? 'station-2' : 'station-1'],
            );
          await pool.query(
            "insert into crowd_reports (id,observed_at,text,status,cluster_id,still_happening,producer) values ($1,$2,'private text',$3,$1,$4,$5)",
            [
              id,
              now.minus({ minutes: index }).toISO(),
              index === 22 ? 'rejected' : 'accepted',
              index !== 21,
              index === 20 ? 'trusted' : 'public',
            ],
          );
          if (index !== 19 && index !== 20)
            await pool.query(
              "insert into crowd_report_abuse_events (id,report_id,ip_hash,turnstile_outcome,rate_limit_bucket_start_at) values ($1,$1,'private-hash','passed',$2)",
              [id, now.toISO()],
            );
        }
        await signalCache.repairCommunitySignalCache(db);
        for (const scope of [
          {},
          { stationId: 'station-1' },
          { stationId: 'station-2' },
          { lineId: 'line' },
        ]) {
          const expected = await sqlSignals(scope);
          expect(
            await getPageCommunitySignals(
              { includeCommunitySignals: true },
              scope,
            ),
          ).toEqual(expected);
        }
        const all = await getPageCommunitySignals({
          includeCommunitySignals: true,
        });
        expect(all.map((row) => row.id)).toContain('cluster-20');
        expect(all.map((row) => row.id)).not.toContain('cluster-19');
        expect(all.map((row) => row.id)).not.toContain('cluster-21');
        expect(all.map((row) => row.id)).not.toContain('cluster-22');
        expect(all.map((row) => row.id)).not.toContain('cluster-23');
        expect(
          await liveRedis.get(signalCache.getCommunitySignalCacheKey()),
        ).not.toContain('private');
      });

      it('publishes standalone moderation and removes a rejected report from current metrics', async () => {
        await signalCache.repairCommunitySignalCache(db);
        const report = await persistCrowdReport(
          db,
          submission(),
          abuse('moderated'),
          { now },
        );
        expect(await signalCache.readCachedCommunitySignals()).toEqual({
          status: 'ready',
          signals: [],
        });
        await automoderateCrowdReport(db, report.id, submission(), { now });
        expect(await signalCache.readCachedCommunitySignals()).toEqual({
          status: 'ready',
          signals: await sqlSignals(),
        });
        expect(await sqlSignals()).toHaveLength(1);
        await automoderateCrowdReport(
          db,
          report.id,
          {
            ...submission(),
            observedAt: now.minus({ hours: 7 }).toJSDate().toISOString(),
            isStillHappening: false,
          },
          { now },
        );
        expect(await sqlSignals()).toEqual([]);
        expect(await signalCache.readCachedCommunitySignals()).toEqual({
          status: 'ready',
          signals: [],
        });
      });

      it('publishes concurrent duplicates and dispatch, and repairs committed publication failures on replay', async () => {
        await signalCache.repairCommunitySignalCache(db);
        await Promise.all([
          persistAutomoderatedCrowdReport(db, submission(), abuse('one'), {
            now,
          }),
          persistAutomoderatedCrowdReport(
            db,
            submission('station-2'),
            abuse('two'),
            { now },
          ),
        ]);
        let signals = await sqlSignals();
        expect(signals).toHaveLength(1);
        expect(signals[0]).toMatchObject({
          reportCount: 2,
          stationIds: ['station-1', 'station-2'],
        });
        expect(
          await getPageCommunitySignals({ includeCommunitySignals: true }),
        ).toEqual(signals);
        const delivery = {
          producer: 'trusted',
          externalReportId: 'external',
          requestPayloadDigest: 'digest',
        };
        const connect = vi
          .spyOn(liveRedis, 'duplicate')
          .mockImplementationOnce(() => {
            throw Error('publication unavailable');
          });
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const accepted = await persistAutomoderatedProgrammaticCrowdReport(
          db,
          submission(),
          delivery,
          { now },
        );
        expect(accepted.created).toBe(true);
        expect((await signalCache.readCachedCommunitySignals()).status).toBe(
          'missing',
        );
        signals = await sqlSignals();
        expect(signals[0].reportCount).toBe(3);
        expect(
          await getPageCommunitySignals({ includeCommunitySignals: true }),
        ).toEqual(signals);
        connect.mockRestore();
        expect(
          await findProgrammaticCrowdReportRetry(db, delivery),
        ).toMatchObject({ id: accepted.id, created: false });
        expect(await signalCache.readCachedCommunitySignals()).toEqual({
          status: 'ready',
          signals,
        });
        const candidates = await getDispatchableCrowdReportCandidates(db, {
          rootUrl: 'https://example.test',
        });
        expect(candidates).toHaveLength(1);
        const fetcher = vi
          .fn()
          .mockResolvedValue(new Response(null, { status: 204 }));
        const result = await dispatchPendingCrowdReports(
          db,
          { rootUrl: 'https://example.test', token: 'token', candidates },
          fetcher,
        );
        expect(result.failed).toBe(0);
        expect(await sqlSignals()).toEqual([]);
        expect(await signalCache.readCachedCommunitySignals()).toEqual({
          status: 'ready',
          signals: [],
        });
        log.mockRestore();
      });

      it('keeps missing, corrupt, unavailable and failed writes distinct from initialized empty', async () => {
        await persistAutomoderatedCrowdReport(db, submission(), abuse('one'), {
          now,
        });
        const expected = await sqlSignals();
        for (const raw of ['', '{}', '{broken']) {
          if (raw)
            await liveRedis.set(signalCache.getCommunitySignalCacheKey(), raw);
          else await liveRedis.del(signalCache.getCommunitySignalCacheKey());
          expect(
            (await signalCache.readCachedCommunitySignals()).status,
          ).not.toBe('ready');
          expect(
            await getPageCommunitySignals({ includeCommunitySignals: true }),
          ).toEqual(expected);
          expect(
            await liveRedis.get(signalCache.getCommunitySignalCacheKey()),
          ).toBe(raw || null);
        }
        await signalCache.repairCommunitySignalCache(db);
        const read = vi
          .spyOn(liveRedis, 'getrange')
          .mockRejectedValueOnce(Error('Redis unavailable'));
        expect(
          await getPageCommunitySignals({ includeCommunitySignals: true }),
        ).toEqual(expected);
        read.mockRestore();
        const set = vi
          .spyOn(liveRedis, 'set')
          .mockRejectedValueOnce(Error('invalidation unavailable'));
        await expect(
          persistAutomoderatedCrowdReport(db, submission(), abuse('two'), {
            now,
          }),
        ).rejects.toThrow('invalidation unavailable');
        expect(await sqlSignals()).toEqual(expected);
        set.mockRestore();
        const publisher = liveRedis.duplicate();
        vi.spyOn(liveRedis, 'duplicate').mockReturnValueOnce(publisher);
        const watch = publisher.watch.bind(publisher);
        vi.spyOn(publisher, 'watch').mockImplementationOnce(async (key) => {
          const result = await watch(key);
          // A timed-out older invalidation can land after repair has begun.
          await liveRedis.set(
            signalCache.getCommunitySignalCacheKey(),
            JSON.stringify({ pending: 'delayed' }),
          );
          return result;
        });
        await expect(
          signalCache.repairCommunitySignalCache(db),
        ).rejects.toThrow('superseded');
        expect((await signalCache.readCachedCommunitySignals()).status).toBe(
          'missing',
        );
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL unavailable'),
        );
        await expect(page()).rejects.toThrow('SQL unavailable');
        vi.mocked(database.getDefaultDb).mockResolvedValue(db);
        await signalCache.repairCommunitySignalCache(db);
        const select = vi
          .spyOn(db, 'transaction')
          .mockRejectedValueOnce(Error('SQL unavailable'));
        await expect(
          signalCache.repairCommunitySignalCache(db),
        ).rejects.toThrow('SQL unavailable');
        select.mockRestore();
        expect((await signalCache.readCachedCommunitySignals()).status).toBe(
          'ready',
        );
      });
    },
  );
});
