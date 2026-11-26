import { nonPublicEvidenceRedactedText } from '@mrtdown/fs';
import { getTownProfileFn, getTownsFn } from '~/util/town.functions';
import { getTownProfileReadModel } from './towns';
import { getOperatorProfileFn } from '~/util/operator.functions';
import { getOperatorProfileReadModel } from './operators';
import { getStationsDirectoryFn } from '~/util/station.functions';
import { getLinesDirectoryFn, getLineProfileFn } from '~/util/lines.functions';
import { getLineProfileReadModel } from './lines';
import { getIssueFn } from '~/util/issue.functions';
import {
  getCachedIssueProfile,
  revalidateIssueProfileResponse,
} from '~/util/issueProfileCache.server';
import {
  issueProfileSnapshotStore,
  publishIssueProfileSnapshot,
} from '~/util/issueProfileSnapshot.server';
import { getIssueReadModel } from './issue';
import { parseIssueProfileSnapshotInputs } from './issueProfileSnapshotInputs';
import {
  applyPublicDataCacheHeaders,
  ISSUE_PROFILE_FRESH_UNTIL_HEADER,
  ISSUE_PROFILE_PUBLICATION_HEADER,
} from '~/util/publicResponseCache';
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
  createPublishedSnapshotStore,
  getSnapshotKeyPrefix,
} from '~/util/publishedSnapshotStore.server';
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
import {
  publishStationProfileSnapshot,
  stationProfileSnapshotStore,
} from '~/util/stationProfileSnapshot.server';
import { getStatisticsFn } from '~/util/statistics.functions';
import {
  parseStatisticsInputs,
  statisticsSnapshotStore,
} from '~/util/statisticsSnapshot.server';
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
import {
  rebuildOperationalFactsForDate,
  rebuildOperationalFactsForDates,
  rebuildOperationalFactsRange,
} from './operationalFacts';
import { getOverviewData, getSystemMapData } from './overview';
import {
  getSitemapData,
  publishSitemapSnapshot,
  rebuildSitemapSnapshot,
} from './sitemap';
import { parseStationProfileSnapshotInputs } from './stationProfileSnapshotInputs';
import {
  getStationsDirectoryData,
  getStationProfileReadModel,
} from './stations';
import {
  getStatisticsData,
  publishStatisticsSnapshot,
  rebuildStatisticsSnapshot,
} from './statistics';

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
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const builder = {
      handler: (handle: unknown) => handle,
      inputValidator: (_validate: unknown) => builder,
    };
    return builder;
  },
}));
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

  describe.skipIf(!process.env.TEST_SNAPSHOT_REDIS_URL)(
    'published statistics with real Redis',
    () => {
      let statisticsRedis: Redis;
      const prefix = () => getSnapshotKeyPrefix('statistics');
      beforeEach(async () => {
        vi.stubEnv(
          'TIER',
          `statistics_test_${randomUUID().replaceAll('-', '')}`,
        );
        statisticsRedis = new Redis(process.env.TEST_SNAPSHOT_REDIS_URL ?? '', {
          lazyConnect: true,
        });
        await statisticsRedis.connect();
        vi.mocked(redisConnection.getPageProfileRedis).mockResolvedValue(
          statisticsRedis,
        );
        await recordCanonicalManifestFingerprint(db, 'c'.repeat(64));
      });
      afterEach(async () => {
        const keys = await statisticsRedis.keys(
          `mrtdown:*${process.env.TIER}*`,
        );
        if (keys.length) await statisticsRedis.del(...keys);
        await statisticsRedis.quit();
      });
      function coldReader() {
        const cold = createPublishedSnapshotStore(
          async () => statisticsRedis,
          'statistics',
          parseStatisticsInputs,
        );
        vi.spyOn(statisticsSnapshotStore, 'read').mockImplementation(cold.read);
        return cold;
      }
      it('serves the full nonempty loader cold/warm without SQL and preserves rebuild windows across midnight and repair', async () => {
        await rebuildOperationalFactsRange(1);
        const rebuilt = await rebuildStatisticsSnapshot();
        const baseline = await getStatisticsFn();
        expect(baseline.data.issueIdsDisruptionLongest).toEqual(['issue']);
        expect(
          baseline.data.chartTotalIssueCountByLine.data[0].payload.totalIssues,
        ).toBe(1);
        expect(baseline.included.issues.issue.title['en-SG']).toBe(
          'Original issue',
        );
        expect(
          baseline.data.chartRollingYearHeatmap.data.at(-1)?.payload.disruption,
        ).toBe(1);
        const published = await publishStatisticsSnapshot();
        expect(
          await statisticsRedis.ttl(`${prefix()}:payload:${published?.sha256}`),
        ).toBe(-1);
        vi.setSystemTime(now.plus({ days: 1 }).toJSDate());
        // Repair republishes the persisted rebuild rather than moving its clock.
        await publishStatisticsSnapshot();
        expect((await statisticsSnapshotStore.read())?.inputs.asOf).toBe(
          rebuilt.asOf,
        );
        const cold = coldReader();
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        headers.mockClear();
        queries.length = 0;
        expect(await getStatisticsFn()).toEqual(baseline);
        expect((await cold.read())?.source).toBe('memory');
        expect(await getStatisticsFn()).toEqual(baseline);
        expect(headers).not.toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(queries).toEqual([]);
      });
      it('keeps completed inputs through partial promotion and rejects delayed activation after a newer facts rebuild', async () => {
        await rebuildStatisticsSnapshot();
        const first = await publishStatisticsSnapshot();
        const baseline = await getStatisticsData();
        await markPageProfilesUpdating(db);
        await pool.query("update issues set title = $1 where id='issue'", [
          {
            ...baseline.included.issues.issue.title,
            'en-SG': 'Corrected issue',
          },
        ]);
        await rebuildStatisticsSnapshot(undefined, 'next');
        await expect(publishStatisticsSnapshot()).rejects.toThrow(
          'completed canonical inputs',
        );
        expect(await getStatisticsData()).toEqual(baseline);
        await completePageProfileGeneration(db, 'next');
        const entered = Promise.withResolvers<void>();
        const resume = Promise.withResolvers<void>();
        const activate = statisticsSnapshotStore.publish;
        vi.spyOn(statisticsSnapshotStore, 'publish').mockImplementationOnce(
          async (...args) => {
            entered.resolve();
            await resume.promise;
            return activate(...args);
          },
        );
        const delayed = publishStatisticsSnapshot();
        const rejected = expect(delayed).rejects.toThrow('superseded');
        await entered.promise;
        vi.setSystemTime(now.plus({ days: 1 }).toJSDate());
        await pool.query("update issues set title = $1 where id='issue'", [
          {
            ...baseline.included.issues.issue.title,
            'en-SG': 'Latest facts rebuild',
          },
        ]);
        await rebuildStatisticsSnapshot();
        await publishStatisticsSnapshot();
        resume.resolve();
        await rejected;
        expect(
          (await getStatisticsData()).included.issues.issue.title['en-SG'],
        ).toBe('Latest facts rebuild');
        expect(
          await statisticsRedis.ttl(`${prefix()}:payload:${first?.sha256}`),
        ).toBeGreaterThan(0);
      });
      it('recovers missing, corrupt and unavailable Redis data through SQL, retaining incomplete snapshot errors', async () => {
        await rebuildStatisticsSnapshot();
        const baseline = await getStatisticsData();
        for (const failure of [
          'missing',
          'corrupt',
          'incomplete',
          'unavailable',
        ]) {
          const published = await publishStatisticsSnapshot();
          coldReader();
          if (failure === 'missing')
            await statisticsRedis.del(`${prefix()}:active`);
          if (failure === 'corrupt')
            await statisticsRedis.set(
              `${prefix()}:payload:${published?.sha256}`,
              'corrupt',
            );
          if (failure === 'incomplete') {
            const unchecked = createPublishedSnapshotStore(
              async () => statisticsRedis,
              'statistics',
              (value) => value,
            );
            await unchecked.publish(
              (await unchecked.head()).raw,
              {
                kind: 'statistics_inputs.v1',
                asOf: now.toISO(),
                data: baseline.data,
              },
              generation,
              'c'.repeat(64),
            );
          }
          if (failure === 'unavailable')
            vi.spyOn(statisticsRedis, 'getrangeBuffer').mockRejectedValueOnce(
              Error('unavailable'),
            );
          headers.mockClear();
          queries.length = 0;
          expect(await getStatisticsFn()).toEqual(baseline);
          expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
          expect(
            queries.filter((q) => q.includes('from "statistics_snapshots"')),
          ).toHaveLength(1);
        }
        await statisticsRedis.del(`${prefix()}:active`);
        await pool.query(
          "update statistics_snapshots set data = $1 where id='latest'",
          [baseline.data],
        );
        await expect(getStatisticsFn()).rejects.toThrow(
          'missing or incomplete',
        );
        await expect(publishStatisticsSnapshot()).rejects.toThrow(
          'missing or incomplete',
        );
      });
      it('repairs a complete legacy SQL projection once before publication', async () => {
        await rebuildStatisticsSnapshot();
        await pool.query(
          "update statistics_snapshots set data = data - 'generation' where id='latest'",
        );
        await publishStatisticsSnapshot();
        const cached = await getStatisticsData();
        vi.stubEnv('REDIS_URL', undefined);
        expect(await getStatisticsData()).toEqual(cached);
        vi.stubEnv('REDIS_URL', 'redis://unused');
        vi.mocked(redisConnection.getPageProfileRedis).mockResolvedValue(
          statisticsRedis,
        );
        vi.setSystemTime(now.plus({ days: 1 }).toJSDate());
        const old = (await statisticsSnapshotStore.read())?.inputs.asOf;
        await publishStatisticsSnapshot();
        expect((await statisticsSnapshotStore.read())?.inputs.asOf).toBe(old);
      });
    },
  );

  describe.skipIf(!process.env.TEST_SNAPSHOT_REDIS_URL)(
    'published Issue Profiles with real Redis',
    () => {
      let issueRedis: Redis;
      beforeEach(async () => {
        vi.stubEnv(
          'TIER',
          `issue_profiles_test_${randomUUID().replaceAll('-', '')}`,
        );
        issueRedis = new Redis(process.env.TEST_SNAPSHOT_REDIS_URL ?? '');
        vi.mocked(redisConnection.getPageProfileRedis).mockResolvedValue(
          issueRedis,
        );
        await recordCanonicalManifestFingerprint(db, 'a'.repeat(64));
      });
      afterEach(async () => {
        const keys = await issueRedis.keys(`mrtdown:*${process.env.TIER}*`);
        if (keys.length) await issueRedis.del(...keys);
        await issueRedis.quit();
      });
      const request = new Request('https://example.com/issues/issue', {
        headers: { 'x-tsr-serverfn': 'true' },
      });
      function rendered(body: string) {
        const response = new Response(body, {
          headers: { 'Content-Type': 'text/html' },
        });
        for (const [key, value] of headers.mock.calls)
          response.headers.set(key, value);
        return response;
      }
      const finalize = async (response: Response) =>
        applyPublicDataCacheHeaders(
          request,
          await revalidateIssueProfileResponse(response),
        );
      it('matches full SQL cold/warm across midnight, future/ongoing/recurring/inferred intervals and service revisions', async () => {
        await pool.query(
          "update service_revisions set end_at='2026-11-19' where id='revision'",
        );
        await pool.query(`insert into service_revisions (id,service_id,start_at,end_at,estimated_frequency,operating_hours)
          select 'loop','service','2026-11-19',null,estimated_frequency,operating_hours from service_revisions limit 1`);
        await pool.query(`insert into service_revision_path_station_entries (service_revision_id,service_id,path_index,station_id,display_code)
          values ('loop','service',0,'station-1','T1'),('loop','service',1,'station-2','T2'),('loop','service',2,'station-1','T1')`);
        await pool.query(
          "update lines set platform_door_count=null,train_car_counts='[]'",
        );
        await pool.query(`insert into issues(id,type,title,title_meta,hash)
          select extra.id,kind,title,'{"private":"never publish"}',hash from issues cross join (values ('inferred','disruption'::issue_type),('open','infra'::issue_type),('recurring','maintenance'::issue_type)) as extra(id,kind) where issues.id='issue'`);
        await pool.query(`insert into impact_events(id,ts,issue_id,type) values
          ('inferred-period','2026-11-18T10:00:00+08:00','inferred','periods.set'),
          ('open-period','2026-11-18T10:00:00+08:00','open','periods.set'),
          ('recurring-period','2026-11-18T10:00:00+08:00','recurring','periods.set')`);
        await pool.query(`insert into impact_event_periods(impact_event_id,index,start_ts,end_ts) values
          ('inferred-period',0,'2026-11-18T10:00:00+08:00',null),
          ('open-period',0,'2026-11-18T10:00:00+08:00',null),
          ('recurring-period',0,'2026-11-18T23:50:00+08:00','2026-11-19T00:10:00+08:00'),
          ('recurring-period',1,'2026-11-19T00:20:00+08:00','2026-11-19T00:30:00+08:00')`);
        await pool.query(
          `insert into impact_event_entity_services(impact_event_id,service_id) values ('recurring-period','service')`,
        );
        await pool.query(
          `insert into evidences(id,issue_id,type,text,render,source_url,ts) values
          ('redacted','issue','report.public',$1,'{"text":{"en-SG":"private translation"}}','https://example.com/redacted','2026-11-18T10:30:00+08:00'),
          ('first','issue','report.public','Public update','{"text":{"en-SG":"Public update","zh-Hans":"更新","ms":null,"ta":null}}','https://example.com/update','2026-11-18T10:30:00+08:00'),
          ('inferred-evidence','inferred','report.public','Still delayed',null,'https://example.com/inferred','2026-11-18T10:00:00+08:00')`,
          [nonPublicEvidenceRedactedText],
        );
        const clocks = [
          '2026-11-18T09:59:00',
          '2026-11-18T10:15:00',
          '2026-11-18T10:30:00',
          '2026-11-18T23:59:59',
          '2026-11-19T00:00:00',
          '2026-11-19T00:10:00',
          '2026-11-19T00:20:00',
          '2026-11-19T00:30:00',
          '2026-11-20T00:00:00',
        ].map((iso) => DateTime.fromISO(iso, { zone: 'Asia/Singapore' }));
        const ids = ['issue', 'inferred', 'open', 'recurring'];
        const expected = [];
        for (const clock of clocks)
          expected.push(
            await Promise.all(
              ids.map((id) => getIssueReadModel(id, clock, db)),
            ),
          );
        const publication = await publishIssueProfileSnapshot();
        expect(publication?.bytes).toBeLessThan(4 * 1024 * 1024);
        const part = await issueProfileSnapshotStore.read();
        expect(JSON.stringify(part)).not.toContain('private translation');
        expect(JSON.stringify(part)).not.toContain('never publish');
        expect(part?.inputs.updates.issue[1]).toMatchObject({
          text: '',
          textTranslations: null,
          isTextRedacted: true,
        });
        const cold = createPublishedSnapshotStore(
          async () => issueRedis,
          'issue-profiles',
          parseIssueProfileSnapshotInputs,
        );
        vi.spyOn(issueProfileSnapshotStore, 'readSelected').mockImplementation(
          cold.readSelected,
        );
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        queries.length = 0;
        for (let pass = 0; pass < 2; pass++)
          for (const [i, clock] of clocks.entries()) {
            for (const [j, id] of ids.entries()) {
              headers.mockClear();
              vi.setSystemTime(clock.toJSDate());
              expect(await getIssueFn({ data: { issueId: id } })).toEqual(
                expected[i][j],
              );
              const intervals = expected[i][j].included.issues[id].intervals;
              const completed =
                intervals.length > 0 &&
                intervals.every((interval) => interval.status === 'ended');
              expect(headers).toHaveBeenCalledWith(
                completed ? ISSUE_PROFILE_FRESH_UNTIL_HEADER : 'Cache-Control',
                completed
                  ? String(clock.plus({ days: 1 }).startOf('day').toMillis())
                  : 'no-store',
              );
            }
          }
        expect(queries).toEqual([]);
        expect(expected[1][0].included.issues.issue.intervals[0].status).toBe(
          'ongoing',
        );
        expect(expected[2][0].included.issues.issue.intervals[0].status).toBe(
          'ended',
        );
        expect(
          expected.at(-1)?.[1].included.issues.inferred.intervals[0].status,
        ).toBe('ended');
      });
      it('publishes corrections/redactions/deletions and recovers new or unknown IDs without negative caching', async () => {
        await pool.query(
          `insert into evidences(id,issue_id,type,text,source_url,ts) values ('evidence','issue','report.public','Original','https://example.com','2026-11-18T10:00:00+08:00')`,
        );
        await publishIssueProfileSnapshot();
        headers.mockClear();
        const pendingBody = JSON.stringify(
          await getIssueFn({ data: { issueId: 'issue' } }),
        );
        const pending = rendered(pendingBody);
        await pool.query(
          "update evidences set text=$1, render='{}' where id='evidence'",
          [nonPublicEvidenceRedactedText],
        );
        await pool.query(
          "update issues set title=jsonb_set(title,'{en-SG}',$1::jsonb) where id='issue'",
          [JSON.stringify('Corrected')],
        );
        await completePageProfileGeneration(db, 'corrected');
        await publishIssueProfileSnapshot();
        const expected = await getIssueReadModel('issue', now, db);
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        queries.length = 0;
        // Rendering began before redaction/publication and completes after its purge.
        for (const contentType of [
          'text/html',
          'text/markdown',
          'application/json',
        ]) {
          const response = pending.clone();
          response.headers.set('Content-Type', contentType);
          const guarded = await finalize(response);
          expect(guarded.headers.get('Cache-Control')).toBe('no-store');
          expect(guarded.headers.has('Cloudflare-CDN-Cache-Control')).toBe(
            false,
          );
          expect(guarded.headers.has('Cache-Tag')).toBe(false);
          expect(guarded.headers.has(ISSUE_PROFILE_FRESH_UNTIL_HEADER)).toBe(
            false,
          );
          expect(guarded.headers.has(ISSUE_PROFILE_PUBLICATION_HEADER)).toBe(
            false,
          );
          expect(await guarded.text()).toContain('Original');
        }
        headers.mockClear();
        expect(await getIssueFn({ data: { issueId: 'issue' } })).toEqual(
          expected,
        );
        const current = rendered(JSON.stringify(expected));
        expect(
          (await finalize(current.clone())).headers.get(
            'Cloudflare-CDN-Cache-Control',
          ),
        ).toContain('public, max-age=');
        expect(
          (await finalize(current.clone())).headers.has(
            ISSUE_PROFILE_PUBLICATION_HEADER,
          ),
        ).toBe(false);
        vi.spyOn(issueProfileSnapshotStore, 'head')
          .mockResolvedValueOnce({ raw: Buffer.alloc(0), value: undefined })
          .mockRejectedValueOnce(Error('Redis unavailable'));
        for (let i = 0; i < 2; i++) {
          const response = await finalize(current.clone());
          expect(response.headers.get('Cache-Control')).toBe('no-store');
          expect(await response.text()).toBe(JSON.stringify(expected));
        }
        expect(queries).toEqual([]);
        expect((await getCachedIssueProfile('issue', now)).profile).toEqual(
          expected,
        );
        expect(expected.data.updates[0]).toMatchObject({
          text: '',
          isTextRedacted: true,
        });
        vi.mocked(database.getDefaultDb).mockResolvedValue(db);
        headers.mockClear();
        await expect(
          getIssueFn({ data: { issueId: 'new' } }),
        ).rejects.toMatchObject({ status: 404 });
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        await pool.query(
          "insert into issues(id,type,title,title_meta,hash) select 'new',type,title,title_meta,hash from issues where id='issue'",
        );
        headers.mockClear();
        await getIssueFn({ data: { issueId: 'new' } });
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        vi.stubEnv('REDIS_URL', '');
        expect((await getCachedIssueProfile('new', now)).source).toBe('sql');
        vi.stubEnv('REDIS_URL', 'redis://unused');
        await publishIssueProfileSnapshot();
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        expect((await getCachedIssueProfile('new', now)).source).toBe('redis');
        vi.mocked(database.getDefaultDb).mockResolvedValue(db);
        await pool.query("delete from issues where id='issue'");
        await publishIssueProfileSnapshot();
        await expect(getCachedIssueProfile('issue', now)).rejects.toMatchObject(
          { status: 404 },
        );
      });
      it('retains completed inputs during failed promotion and recovers missing/corrupt snapshots', async () => {
        await publishIssueProfileSnapshot();
        const active = await issueProfileSnapshotStore.read();
        if (!active) throw Error('Missing fixture publication');
        const expected = await getIssueReadModel('issue', now, db);
        await expect(
          issueProfileSnapshotStore.publish(
            active.raw,
            { ...active.inputs, updates: {} },
            'invalid',
            'a'.repeat(64),
          ),
        ).rejects.toThrow('incomplete');
        await markPageProfilesUpdating(db);
        await expect(publishIssueProfileSnapshot()).rejects.toThrow(
          'completed canonical',
        );
        expect((await issueProfileSnapshotStore.head()).raw).toEqual(
          active.raw,
        );
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        expect((await getCachedIssueProfile('issue', now)).profile).toEqual(
          expected,
        );
        vi.mocked(database.getDefaultDb).mockResolvedValue(db);
        const key = `${getSnapshotKeyPrefix('issue-profiles')}:payload:${active.value.sha256}`;
        for (const corrupt of [true, false]) {
          if (corrupt) await issueRedis.set(key, 'corrupt');
          else await issueRedis.del(key);
          expect(
            await issueProfileSnapshotStore.read({ verifyPayload: true }),
          ).toBeNull();
          const recovery = createPublishedSnapshotStore(
            async () => issueRedis,
            'issue-profiles',
            parseIssueProfileSnapshotInputs,
          );
          vi.spyOn(
            issueProfileSnapshotStore,
            'readSelected',
          ).mockImplementation(recovery.readSelected);
          headers.mockClear();
          expect(await getIssueFn({ data: { issueId: 'issue' } })).toEqual(
            expected,
          );
          expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        }
      });
    },
  );

  describe.skipIf(!process.env.TEST_SNAPSHOT_REDIS_URL)(
    'published station profiles with real Redis',
    () => {
      let stationRedis: Redis;
      beforeEach(async () => {
        vi.stubEnv(
          'TIER',
          `station_profiles_test_${randomUUID().replaceAll('-', '')}`,
        );
        stationRedis = new Redis(process.env.TEST_SNAPSHOT_REDIS_URL ?? '', {
          lazyConnect: true,
        });
        await stationRedis.connect();
        vi.mocked(redisConnection.getPageProfileRedis).mockResolvedValue(
          stationRedis,
        );
      });
      afterEach(async () => {
        const keys = await stationRedis.keys(`mrtdown:*${process.env.TIER}*`);
        if (keys.length) await stationRedis.del(...keys);
        await stationRedis.quit();
      });

      it.each(['range', 'dates', 'single'] as const)(
        'rolls back all %s fact replacements if the final station projection fails',
        async (kind) => {
          await rebuildOperationalFactsRange(6);
          await publishStationProfileSnapshot('a'.repeat(64));
          const head = await stationProfileSnapshotStore.head();
          const tables = [
            'line_day_facts',
            'issue_day_facts',
            'line_day_issue_intervals',
            'station_issue_facts',
          ];
          const readFacts = async () =>
            Promise.all(
              tables.map((table) =>
                pool
                  .query(
                    `select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`,
                  )
                  .then((result) => result.rows),
              ),
            );
          const before = await readFacts();
          await pool.query('update lines set operating_hours=null');
          await pool.query(
            `create function fail_profile_facts() returns trigger language plpgsql as $$ begin raise exception 'forced fact rebuild failure'; end $$`,
          );
          await pool.query(
            'create trigger fail_profile_facts before insert on station_issue_facts for each row execute function fail_profile_facts()',
          );
          const rebuild = () =>
            kind === 'range'
              ? rebuildOperationalFactsRange(6)
              : kind === 'dates'
                ? rebuildOperationalFactsForDates(
                    Array.from(
                      { length: 6 },
                      (_, index) =>
                        now.minus({ days: index }).toISODate() ?? '',
                    ),
                  )
                : rebuildOperationalFactsForDate(now);
          try {
            await expect(rebuild()).rejects.toMatchObject({
              cause: { message: 'forced fact rebuild failure' },
            });
            expect(await readFacts()).toEqual(before);
            expect((await stationProfileSnapshotStore.head()).raw).toEqual(
              head.raw,
            );
          } finally {
            await pool.query(
              'drop trigger fail_profile_facts on station_issue_facts',
            );
            await pool.query('drop function fail_profile_facts()');
          }
          await rebuild();
          await publishStationProfileSnapshot('a'.repeat(64));
          expect(await readFacts()).not.toEqual(before);
          expect((await stationProfileSnapshotStore.head()).raw).not.toEqual(
            head.raw,
          );
        },
      );

      it('holds profile publication while committed holiday changes still need their workflow facts', async () => {
        await rebuildOperationalFactsRange(1);
        await publishStationProfileSnapshot('a'.repeat(64));
        const before = await stationProfileSnapshotStore.head();
        const result = await syncPublicHolidays(db, [
          normalizeDataGovPublicHolidayRecord({
            date: '2026-11-19',
            holiday: 'Changed holiday',
          }),
        ]);
        await expect(
          publishStationProfileSnapshot('a'.repeat(64)),
        ).rejects.toThrow('pending public-holiday workflow');
        expect((await stationProfileSnapshotStore.head()).raw).toEqual(
          before.raw,
        );
        await rebuildOperationalFactsForDates(result.changedDates, db);
        await expect(
          publishStationProfileSnapshot('a'.repeat(64), []),
        ).rejects.toThrow('pending public-holiday workflow');
        await publishStationProfileSnapshot(
          'a'.repeat(64),
          result.changedDates,
        );
        expect(
          (await stationProfileSnapshotStore.read())?.inputs.dataset
            .publicHolidayRows,
        ).toEqual([{ date: '2026-11-18' }, { date: '2026-11-19' }]);
      });

      it('matches complete town profiles and directory cold/warm with SQL disabled across effective memberships and issue windows', async () => {
        for (const id of ['empty', 'planned', 'closed', 'unknown'])
          await pool.query(
            'insert into towns (id,name,hash) select $1,name,hash from towns limit 1',
            [id],
          );
        await pool.query(
          "update stations set town_id='planned' where id='station-3'",
        );
        await pool.query(
          "update station_codes set started_at='2026-11-19' where station_id in ('station-2','station-3')",
        );
        await pool.query(
          "update station_codes set ended_at='2026-11-19' where code='LEGACY'",
        );
        await pool.query(
          "insert into lines (id,name,type,color,started_at,operating_hours,hash) select 'unknown',name,type,color,null,null,hash from lines limit 1",
        );
        await pool.query(
          "insert into stations (id,name,town_id,geo,hash) select 'closed-station',name,'closed',geo,hash from stations limit 1",
        );
        await pool.query(
          "insert into stations (id,name,town_id,geo,hash) select 'unknown-station',name,'unknown',geo,hash from stations limit 1",
        );
        await pool.query(
          "insert into station_codes (line_id,station_id,code,started_at,ended_at,structure_type) values ('line','closed-station','CLOSED','1990-01-01','2000-01-01','underground'),('unknown','unknown-station','U1','2000-01-01',null,'underground')",
        );
        const clocks = [
          now.set({ hour: 4 }),
          now.set({ hour: 10, minute: 15 }),
          now.set({ hour: 10, minute: 30 }),
          now.plus({ days: 1 }).startOf('day'),
          now.plus({ days: 100 }),
        ];
        const cases = clocks.flatMap((clock) =>
          ['town', 'empty', 'planned', 'closed', 'unknown'].map((townId) => ({
            clock,
            townId,
          })),
        );
        vi.stubEnv('REDIS_URL', '');
        const expected = [];
        for (const { clock, townId } of cases) {
          vi.setSystemTime(clock.toJSDate());
          expected.push(await getTownProfileFn({ data: { townId } }));
        }
        const directory = await getTownsFn();
        expect(expected[0].data.status).toBe('closed_for_day');
        expect(expected[1].data.status).toBe('not_in_service');
        expect(expected[2].data.status).toBe('future_service');
        expect(expected[3].data.status).toBe('not_in_service');
        expect(expected[4].data.status).toBe('unknown');
        expect(expected[5].data.status).toBe('ongoing_disruption');
        expect(expected[10].data.status).toBe('normal');
        expect(expected[20].data.issueIdsRecent).toEqual([]);
        expect(
          directory.data.towns.find((row) => row.townId === 'planned')?.lineIds,
        ).toEqual(['line']);
        vi.stubEnv('REDIS_URL', 'redis://unused');
        await publishStationProfileSnapshot('a'.repeat(64));
        const cold = createPublishedSnapshotStore(
          async () => stationRedis,
          'station-profiles',
          parseStationProfileSnapshotInputs,
        );
        vi.spyOn(stationProfileSnapshotStore, 'read').mockImplementation(
          cold.read,
        );
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        queries.length = 0;
        for (const [index, { clock, townId }] of cases.entries()) {
          vi.setSystemTime(clock.toJSDate());
          for (let pass = 0; pass < 2; pass++) {
            expect(await getTownProfileFn({ data: { townId } })).toEqual(
              expected[index],
            );
            expect(await getTownsFn()).toEqual(directory);
          }
        }
        expect(queries).toEqual([]);
      });

      it('recovers missing town inputs uncached and publishes corrected town/station relationships together', async () => {
        vi.stubEnv('REDIS_URL', '');
        const before = {
          profile: await getTownProfileFn({ data: { townId: 'town' } }),
          directory: await getTownsFn(),
        };
        vi.stubEnv('REDIS_URL', 'redis://unused');
        headers.mockClear();
        expect(await getTownProfileFn({ data: { townId: 'town' } })).toEqual(
          before.profile,
        );
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        headers.mockClear();
        expect(await getTownsFn()).toEqual(before.directory);
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        await publishStationProfileSnapshot('a'.repeat(64));
        await pool.query(
          "insert into towns (id,name,hash) select 'new-town',name,hash from towns limit 1",
        );
        await pool.query(
          "update stations set town_id='new-town' where id='station-2'",
        );
        expect(await getTownProfileFn({ data: { townId: 'town' } })).toEqual(
          before.profile,
        );
        expect(await getTownsFn()).toEqual(before.directory);
        vi.stubEnv('REDIS_URL', '');
        const after = {
          profile: await getTownProfileFn({ data: { townId: 'town' } }),
          directory: await getTownsFn(),
        };
        vi.stubEnv('REDIS_URL', 'redis://unused');
        await publishStationProfileSnapshot('a'.repeat(64));
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        expect(await getTownProfileFn({ data: { townId: 'town' } })).toEqual(
          after.profile,
        );
        expect(await getTownsFn()).toEqual(after.directory);
        expect(after.profile.data.stationIds).not.toContain('station-2');
        vi.mocked(database.getDefaultDb).mockResolvedValue(db);
        headers.mockClear();
        await expect(getTownProfileReadModel('absent')).rejects.toMatchObject({
          status: 404,
        });
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
      });

      it('matches complete operator loaders cold/warm with SQL disabled across clocks, memberships, empty and unknown operations', async () => {
        await pool.query(
          "insert into operators (id,name,founded_at,url,hash) select 'empty',name,founded_at,url,hash from operators limit 1",
        );
        await pool.query(
          "insert into operators (id,name,founded_at,url,hash) select 'planned',name,founded_at,url,hash from operators limit 1",
        );
        await pool.query(
          "insert into lines (id,name,type,color,started_at,operating_hours,hash) select 'unknown',name,type,color,null,null,hash from lines limit 1",
        );
        await pool.query(
          "insert into lines (id,name,type,color,started_at,operating_hours,hash) select 'future',name,type,color,'2026-11-19',operating_hours,hash from lines where id='line'",
        );
        await pool.query(
          "insert into line_operators (line_id,operator_id,started_at,ended_at,hash) values ('unknown','operator','2027-01-01',null,'fixture'),('future','planned','2026-11-19',null,'fixture')",
        );
        await pool.query(
          "update line_operators set ended_at='2020-01-01' where line_id='line'",
        );
        const clocks = [
          now.set({ hour: 4 }),
          now.set({ hour: 10, minute: 15 }),
          now.set({ hour: 10, minute: 30 }),
          now.plus({ days: 1 }).startOf('day'),
        ];
        const cases = clocks.flatMap((clock) =>
          ['operator', 'empty', 'planned'].map((operatorId) => ({
            clock,
            operatorId,
          })),
        );
        vi.stubEnv('REDIS_URL', '');
        const expected = [];
        for (const { clock, operatorId } of cases) {
          vi.setSystemTime(clock.toJSDate());
          expected.push(
            await getOperatorProfileFn({ data: { operatorId, days: 90 } }),
          );
        }
        expect(expected[0].data.lineIds).toContain('line'); // Historical ownership remains in scope.
        expect(expected[0].data.currentOperationalStatus).toBe('unknown');
        expect(expected[1].data.aggregateUptimeRatio).toBeNull();
        expect(expected[1].data.totalStationsOperated).toBe(0);
        expect(expected[2].data.currentOperationalStatus).toBe(
          'all_lines_closed_for_day',
        );
        expect(expected[3].data.currentOperationalStatus).toBe(
          'some_lines_disrupted',
        );
        vi.stubEnv('REDIS_URL', 'redis://unused');
        await publishStationProfileSnapshot('a'.repeat(64));
        const cold = createPublishedSnapshotStore(
          async () => stationRedis,
          'station-profiles',
          parseStationProfileSnapshotInputs,
        );
        vi.spyOn(stationProfileSnapshotStore, 'read').mockImplementation(
          cold.read,
        );
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        queries.length = 0;
        for (const [index, { clock, operatorId }] of cases.entries()) {
          vi.setSystemTime(clock.toJSDate());
          for (let pass = 0; pass < 2; pass++)
            expect(
              await getOperatorProfileFn({ data: { operatorId, days: 90 } }),
            ).toEqual(expected[index]);
        }
        expect(queries).toEqual([]);
      });

      it('recovers operator inputs uncached and publishes ownership and holiday corrections together', async () => {
        vi.stubEnv('REDIS_URL', '');
        const before = await getOperatorProfileReadModel('operator', 90);
        vi.stubEnv('REDIS_URL', 'redis://unused');
        headers.mockClear();
        expect(await getOperatorProfileReadModel('operator', 90)).toEqual(
          before,
        );
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        await publishStationProfileSnapshot('a'.repeat(64));
        await pool.query('delete from line_operators');
        await pool.query('delete from public_holidays');
        expect(await getOperatorProfileReadModel('operator', 90)).toEqual(
          before,
        );
        vi.stubEnv('REDIS_URL', '');
        const after = await getOperatorProfileReadModel('operator', 90);
        vi.stubEnv('REDIS_URL', 'redis://unused');
        await publishStationProfileSnapshot('a'.repeat(64));
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        expect(await getOperatorProfileReadModel('operator', 90)).toEqual(
          after,
        );
        expect(after.data.lineIds).toEqual([]);
        vi.mocked(database.getDefaultDb).mockResolvedValue(db);
        await expect(
          getOperatorProfileReadModel('absent', 90),
        ).rejects.toMatchObject({ status: 404 });
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
      });

      it('matches full station and line directories cold/warm across membership, incident and persisted-fact date boundaries without SQL', async () => {
        await pool.query(
          "insert into lines (id,name,type,color,started_at,operating_hours,hash) select 'unknown',name,type,color,null,null,hash from lines limit 1",
        );
        await pool.query(
          "insert into station_codes (line_id,station_id,code,started_at,ended_at,structure_type) values ('unknown','station-1','U1','2026-11-19',null,'elevated')",
        );
        await pool.query(
          "update station_codes set started_at='2026-11-19' where station_id='station-2'",
        );
        await pool.query(
          "update station_codes set ended_at='2026-11-19' where station_id='station-3'",
        );
        await pool.query('update impact_event_periods set end_ts=null');
        await rebuildOperationalFactsRange(2);
        const clocks = [
          now.set({ hour: 9 }),
          now.set({ hour: 10, minute: 15 }),
          now.plus({ days: 1 }).startOf('day'),
          now.plus({ days: 100 }),
        ];
        vi.stubEnv('REDIS_URL', '');
        const expected = [];
        for (const clock of clocks) {
          vi.setSystemTime(clock.toJSDate());
          expected.push({
            stations: await getStationsDirectoryFn(),
            lines: await getLinesDirectoryFn(),
          });
        }
        expect(
          expected[0].stations.stations.find((row) => row.id === 'station-2')
            ?.operationalState,
        ).toBe('future');
        expect(
          expected[1].stations.stations.find((row) => row.id === 'station-1')
            ?.status,
        ).toBe('ongoing_disruption');
        expect(
          expected[2].stations.stations.find((row) => row.id === 'station-3')
            ?.operationalState,
        ).toBe('closed');
        expect(
          expected[2].stations.stations.find((row) => row.id === 'station-1')
            ?.status,
        ).toBe('normal');
        expect(
          expected[3].lines.data.lines.every((row) => row.uptimeRatio == null),
        ).toBe(true);
        expect(
          expected[1].stations.stations[0].latestDisruption,
        ).not.toBeNull();
        vi.stubEnv('REDIS_URL', 'redis://unused');
        await publishStationProfileSnapshot('a'.repeat(64));
        const cold = createPublishedSnapshotStore(
          async () => stationRedis,
          'station-profiles',
          parseStationProfileSnapshotInputs,
        );
        vi.spyOn(stationProfileSnapshotStore, 'read').mockImplementation(
          cold.read,
        );
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        queries.length = 0;
        for (const [index, clock] of clocks.entries()) {
          vi.setSystemTime(clock.toJSDate());
          for (let pass = 0; pass < 2; pass++) {
            expect(await getStationsDirectoryFn()).toEqual(
              expected[index].stations,
            );
            expect(await getLinesDirectoryFn()).toEqual(expected[index].lines);
          }
        }
        expect(queries).toEqual([]);
      });

      it('recovers missing directory inputs uncached, then publishes empty facts and corrected latest disruptions', async () => {
        await rebuildOperationalFactsRange(1);
        vi.stubEnv('REDIS_URL', '');
        const before = await getStationsDirectoryData();
        vi.stubEnv('REDIS_URL', 'redis://unused');
        headers.mockClear();
        expect(await getStationsDirectoryFn()).toEqual(before);
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        headers.mockClear();
        await getLinesDirectoryFn();
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        await publishStationProfileSnapshot('a'.repeat(64));
        await pool.query('delete from station_issue_facts');
        await pool.query('delete from issue_day_facts');
        await pool.query('delete from line_day_facts cascade');
        expect(await getStationsDirectoryFn()).toEqual(before);
        vi.stubEnv('REDIS_URL', '');
        const after = {
          stations: await getStationsDirectoryFn(),
          lines: await getLinesDirectoryFn(),
        };
        vi.stubEnv('REDIS_URL', 'redis://unused');
        await publishStationProfileSnapshot('a'.repeat(64));
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        expect(await getStationsDirectoryFn()).toEqual(after.stations);
        expect(await getLinesDirectoryFn()).toEqual(after.lines);
        expect(
          after.stations.stations.every((row) => row.latestDisruption == null),
        ).toBe(true);
      });

      it('matches complete line loaders cold/warm across issue, service, holiday and rolling-fact boundaries without SQL', async () => {
        await pool.query(
          "insert into lines (id,name,type,color,started_at,operating_hours,hash) select 'other',name,type,color,started_at,operating_hours,hash from lines limit 1",
        );
        await pool.query(
          "insert into lines (id,name,type,color,started_at,operating_hours,hash) select 'unknown',name,type,color,null,null,hash from lines limit 1",
        );
        await pool.query(
          "insert into lines (id,name,type,color,started_at,operating_hours,hash) select 'future',name,type,color,'2026-11-19',operating_hours,hash from lines where id='line'",
        );
        await pool.query(
          "insert into station_codes (line_id,station_id,code,started_at,ended_at,structure_type) values ('other','station-1','O1','1990-01-01',null,'underground'),('line','station-2','CLOSED','1990-01-01','2000-01-01','underground'),('future','station-3','F3','2026-11-19',null,'elevated')",
        );
        await pool.query(
          "update service_revisions set end_at='2026-11-19' where id='revision'",
        );
        await pool.query(
          "insert into service_revisions (id,service_id,start_at,end_at,estimated_frequency,operating_hours) select 'loop','service','2026-11-19',null,estimated_frequency,operating_hours from service_revisions limit 1",
        );
        await pool.query(
          "insert into service_revision_path_station_entries (service_revision_id,service_id,path_index,station_id,display_code) values ('loop','service',0,'station-1','T1'),('loop','service',1,'station-2','T2'),('loop','service',2,'station-1','T1')",
        );
        await rebuildOperationalFactsRange(2);
        // Persisted future facts are admitted only when the request reaches them.
        // Old facts roll out, and no synthesized rows appear when time passes.
        await pool.query(
          "insert into line_day_facts (date,line_id,service_seconds,downtime_disruption_seconds,downtime_maintenance_seconds,downtime_infra_seconds,issue_count_disruption,issue_count_maintenance,issue_count_infra,as_of) values ('2026-11-19','other',100,90,0,0,1,0,0,'2026-11-18')",
        );
        const clocks = [
          now.set({ hour: 4 }),
          now.set({ hour: 10, minute: 15 }),
          now.set({ hour: 10, minute: 30 }),
          now.endOf('day'),
          now.plus({ days: 1 }).startOf('day'),
          now.plus({ days: 3 }),
          now.plus({ days: 100 }),
        ];
        const cases = clocks.flatMap((clock) =>
          ['line', 'other', 'unknown', 'future'].map((lineId) => ({
            clock,
            lineId,
          })),
        );
        vi.setSystemTime(clocks[0].toJSDate());
        await persistAutomoderatedCrowdReport(
          db,
          {
            reportScope: 'line',
            lineIds: ['line', 'other'],
            stationIds: ['station-3'],
            observedAt: clocks[0].toISO() ?? '',
            effect: 'delay',
            isStillHappening: true,
          },
          { ipHash: 'line-profile-test', turnstileOutcome: 'passed' },
          { now: clocks[0] },
        );
        vi.stubEnv('REDIS_URL', '');
        const expected = [];
        for (const { clock, lineId } of cases) {
          vi.setSystemTime(clock.toJSDate());
          expected.push(await getLineProfileFn({ data: { lineId, days: 2 } }));
        }
        expect(expected[0].data.lineSummary.status).toBe('closed_for_day');
        expect(expected[2].data.lineSummary.uptimeRatio).toBeNull();
        expect(expected[3].data.lineSummary.status).toBe('future_service');
        expect(expected[4].data.lineSummary.status).toBe('ongoing_disruption');
        expect(expected[8].data.lineSummary.status).toBe('normal');
        expect(expected[4].data.lineSummary.uptimeRank).toBe(2);
        expect(expected[20].data.lineSummary.uptimeRank).toBe(1);
        expect(expected[24].data.lineSummary.totalLines).toBe(1);
        expect(expected[0].data.communitySignals).toHaveLength(1);
        expect(expected.at(-4)?.data.communitySignals).toEqual([]);
        expect(expected[0].included.operators).not.toEqual({});
        vi.stubEnv('REDIS_URL', 'redis://unused');
        vi.setSystemTime(clocks[0].toJSDate());
        await signalCache.repairCommunitySignalCache(db);
        await publishStationProfileSnapshot('a'.repeat(64));
        const cold = createPublishedSnapshotStore(
          async () => stationRedis,
          'station-profiles',
          parseStationProfileSnapshotInputs,
        );
        vi.spyOn(stationProfileSnapshotStore, 'read').mockImplementation(
          cold.read,
        );
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        queries.length = 0;
        for (const [index, { clock, lineId }] of cases.entries()) {
          vi.setSystemTime(clock.toJSDate());
          for (let pass = 0; pass < 2; pass++)
            expect(
              await getLineProfileFn({ data: { lineId, days: 2 } }),
            ).toEqual(expected[index]);
        }
        expect(queries).toEqual([]);
      });

      it('recovers line profiles without caching missing/corrupt inputs, then publishes fact and holiday corrections coherently', async () => {
        await rebuildOperationalFactsRange(1);
        vi.stubEnv('REDIS_URL', '');
        const baseline = await getLineProfileReadModel('line', 90);
        vi.stubEnv('REDIS_URL', 'redis://unused');
        headers.mockClear();
        expect(await getLineProfileReadModel('line', 90)).toEqual(baseline);
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        await publishStationProfileSnapshot('a'.repeat(64));
        await pool.query('delete from public_holidays');
        await pool.query(
          "update lines set operating_hours=null where id='line'",
        );
        await rebuildOperationalFactsRange(1);
        vi.stubEnv('REDIS_URL', '');
        const corrected = await getLineProfileReadModel('line', 90);
        expect(corrected.data.lineSummary.uptimeRatio).toBeNull();
        vi.stubEnv('REDIS_URL', 'redis://unused');
        // Facts and canonical inputs remain together until the next activation.
        expect(await getLineProfileReadModel('line', 90)).toEqual(baseline);
        await publishStationProfileSnapshot('a'.repeat(64));
        const head = await stationProfileSnapshotStore.head();
        if (!head.value) throw Error('Missing profile publication');
        await stationRedis.set(
          `${getSnapshotKeyPrefix('station-profiles')}:payload:${head.value.sha256}`,
          'corrupt',
        );
        const cold = createPublishedSnapshotStore(
          async () => stationRedis,
          'station-profiles',
          parseStationProfileSnapshotInputs,
        );
        vi.spyOn(stationProfileSnapshotStore, 'read').mockImplementation(
          cold.read,
        );
        headers.mockClear();
        expect(await getLineProfileReadModel('line', 90)).toEqual(corrected);
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        await publishStationProfileSnapshot('a'.repeat(64));
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        expect(await getLineProfileReadModel('line', 90)).toEqual(corrected);
        vi.mocked(database.getDefaultDb).mockResolvedValue(db);
        headers.mockClear();
        await expect(
          getLineProfileReadModel('absent', 90),
        ).rejects.toMatchObject({ status: 404 });
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
      });

      it('matches full SQL profiles cold/warm, aliases, service midnight and incident transitions with SQL disabled', async () => {
        // Future revision turns the path into a loop at Singapore midnight.
        await pool.query(
          "update service_revisions set end_at='2026-11-19' where id='revision'",
        );
        await pool.query(`insert into service_revisions (id,service_id,start_at,end_at,estimated_frequency,operating_hours)
        select 'loop','service','2026-11-19',null,estimated_frequency,operating_hours from service_revisions limit 1`);
        await pool.query(`insert into service_revision_path_station_entries (service_revision_id,service_id,path_index,station_id,display_code)
        values ('loop','service',0,'station-1','T1'),('loop','service',1,'station-2','T2'),('loop','service',2,'station-1','T1')`);
        await pool.query(
          "insert into station_platform_services (station_id,platform_id,service_id) values ('station-1','platform-1','service')",
        );
        await pool.query(
          "insert into station_platforms (station_id,platform_id,label,line_id,last_updated,boarding_status) values ('station-1','restricted','R','line','2026-11-18','alighting_only')",
        );
        await pool.query(
          "insert into station_platform_services (station_id,platform_id,service_id) values ('station-1','restricted','service')",
        );
        await pool.query(
          "insert into station_exits (station_id,source_id,source_object_id,source_checksum,label,last_updated,geo) values ('station-1','osm',10,'fixture','A','2026-11-18',ST_SetSRID(ST_MakePoint(103,1),4326)),('station-1','osm',11,'fixture','B','2026-11-18',ST_SetSRID(ST_MakePoint(103,1),4326)),('station-1','osm',12,'fixture','B','2026-11-18',ST_SetSRID(ST_MakePoint(103,1),4326))",
        );
        await pool.query(
          "insert into station_codes (line_id,station_id,code,started_at,ended_at,structure_type) values ('line','station-1','FUTURE','2026-12-01',null,'elevated'),('line','station-1','CLOSED','1990-01-01','2000-01-01','underground'),('line','station-2','LEGACY','1990-01-01',null,'underground')",
        );
        await pool.query(
          "update lines set platform_door_count=null,train_car_counts='[]'",
        );
        await pool.query(
          "insert into stations (id,name,town_id,geo,hash) select 'station_1',name,town_id,geo,hash from stations where id='station-1'",
        );
        await pool.query(
          "insert into station_codes (line_id,station_id,code,started_at,structure_type) values ('line','station_1','LEGACY','1990-01-01','underground')",
        );
        const clocks = [
          now.set({ hour: 10, minute: 15 }),
          now.set({ hour: 10, minute: 30 }),
          now.endOf('day'),
          now.plus({ days: 1 }).startOf('day'),
        ];
        vi.stubEnv('REDIS_URL', '');
        const expected = [];
        for (const clock of clocks) {
          vi.setSystemTime(clock.toJSDate());
          expected.push(
            await getStationProfileReadModel('LEGACY', {
              includeCommunitySignals: true,
            }),
          );
        }
        vi.stubEnv('REDIS_URL', 'redis://unused');
        vi.setSystemTime(clocks[0].toJSDate());
        await signalCache.repairCommunitySignalCache(db);
        const publication = await publishStationProfileSnapshot('a'.repeat(64));
        expect(publication?.bytes).toBeLessThan(4 * 1024 * 1024);
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        queries.length = 0;
        for (const [index, clock] of clocks.entries()) {
          vi.setSystemTime(clock.toJSDate());
          for (const id of ['station-1', 'T1', 'LEGACY'])
            expect(
              await getStationProfileReadModel(id, {
                includeCommunitySignals: true,
              }),
            ).toEqual(expected[index]);
        }
        expect(queries).toEqual([]);
        await expect(
          getStationProfileReadModel('unknown'),
        ).rejects.toMatchObject({ status: 404 });
        expect(expected[0].data.exits).toEqual([
          { id: 10, label: 'A' },
          { id: 12, label: 'B' },
        ]);
        expect(expected[0].data.status).toBe('ongoing_disruption');
        expect(expected[1].data.status).toBe('normal');
        expect(expected[0].freshUntil).toBe(clocks[1].toMillis());
        expect(expected[2].freshUntil).toBe(clocks[3].toMillis());
        expect(
          expected[3].data.arrivalLines[0].arrivalTimings[0],
        ).toMatchObject({
          isLoop: true,
          viaStationId: 'station-2',
          platformLabels: ['A'],
        });
      });

      it('keeps a crossing read coherent and rejects delayed publication and incomplete imports', async () => {
        await publishStationProfileSnapshot('a'.repeat(64));
        const originalRead = stationProfileSnapshotStore.read;
        const old = await originalRead();
        if (!old) throw Error('Missing fixture snapshot');
        const updated = structuredClone(old.inputs);
        const station = updated.dataset.stationRows.find(
          (row) => row.id === 'station-1',
        );
        if (!station) throw Error('Missing station fixture');
        station.name = {
          'en-SG': 'Updated',
          'zh-Hans': null,
          ms: null,
          ta: null,
        };
        const coldStore = createPublishedSnapshotStore(
          async () => stationRedis,
          'station-profiles',
          parseStationProfileSnapshotInputs,
        );
        const getrange = stationRedis.getrange.bind(stationRedis);
        // The cold reader has captured the old head when it requests its payload.
        // Publish before that fetch completes; it must still fetch the old hash.
        vi.spyOn(stationRedis, 'getrange').mockImplementationOnce(
          async (key, start, end) => {
            expect(key).toBe(
              `${getSnapshotKeyPrefix('station-profiles')}:payload:${old.value.sha256}`,
            );
            await stationProfileSnapshotStore.publish(
              old.raw,
              updated,
              'next',
              'b'.repeat(64),
            );
            return getrange(key, start, end);
          },
        );
        vi.spyOn(stationProfileSnapshotStore, 'read').mockImplementationOnce(
          () => coldStore.read(),
        );
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        const first = await getStationProfileReadModel('station-1');
        const second = await getStationProfileReadModel('station-1');
        expect(first.included.stations['station-1'].name['en-SG']).toBe('Test');
        expect(second.included.stations['station-1'].name['en-SG']).toBe(
          'Updated',
        );
        await expect(
          stationProfileSnapshotStore.publish(
            old.raw,
            old.inputs,
            'stale',
            'a'.repeat(64),
          ),
        ).rejects.toThrow('superseded');
        vi.mocked(database.getDefaultDb).mockResolvedValue(db);
        await markPageProfilesUpdating(db);
        await expect(
          publishStationProfileSnapshot('a'.repeat(64)),
        ).rejects.toThrow('completed canonical');
        expect(await getStationProfileReadModel('station-1')).toEqual(second);
      });

      it('uses no-store SQL recovery for absent/corrupt inputs and missing signals, while empty/expired signals stay SQL-free', async () => {
        const baseline = await getStationProfileReadModel('station-1');
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        await publishStationProfileSnapshot('a'.repeat(64));
        // Missing signals retain their independent SQL recovery contract.
        headers.mockClear();
        expect(
          (
            await getStationProfileReadModel('station-1', {
              includeCommunitySignals: true,
            })
          ).data.communitySignals,
        ).toEqual([]);
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        await signalCache.repairCommunitySignalCache(db);
        const key = signalCache.getCommunitySignalCacheKey();
        const raw = JSON.parse((await stationRedis.get(key)) ?? '{}');
        raw.signals = [
          {
            id: 'expired',
            effect: null,
            reportCount: 1,
            lineIds: ['line'],
            stationIds: ['station-1'],
            windowStartAt: now.minus({ hours: 3 }).toISO(),
            windowEndAt: now.minus({ hours: 2 }).toISO(),
            updatedAt: now.toISO(),
          },
        ];
        await stationRedis.set(key, JSON.stringify(raw));
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        headers.mockClear();
        expect(
          await getStationProfileReadModel('station-1', {
            includeCommunitySignals: true,
          }),
        ).toEqual(baseline);
        expect(headers).not.toHaveBeenCalledWith('Cache-Control', 'no-store');
        vi.mocked(database.getDefaultDb).mockResolvedValue(db);
        const head = await stationProfileSnapshotStore.head();
        if (!head.value) throw Error('Missing fixture head');
        await stationRedis.set(
          `${getSnapshotKeyPrefix('station-profiles')}:payload:${head.value.sha256}`,
          'corrupt',
        );
        // Cold payload verification cannot turn corruption into a cached 404.
        expect(
          await stationProfileSnapshotStore.read({ verifyPayload: true }),
        ).toBeNull();
        const coldStore = createPublishedSnapshotStore(
          async () => stationRedis,
          'station-profiles',
          parseStationProfileSnapshotInputs,
        );
        vi.spyOn(stationProfileSnapshotStore, 'read').mockImplementationOnce(
          () => coldStore.read(),
        );
        headers.mockClear();
        expect(await getStationProfileReadModel('station-1')).toEqual(baseline);
        expect(headers).toHaveBeenCalledWith('Cache-Control', 'no-store');
        await publishStationProfileSnapshot('a'.repeat(64));
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('SQL must stay asleep'),
        );
        expect(await getStationProfileReadModel('T1')).toEqual(baseline);
      });
    },
  );

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
    await rebuildOperationalFactsForDates(retry.changedDates, db);
    await publishRangeSnapshot('a'.repeat(64));
    await publishStationProfileSnapshot('a'.repeat(64), retry.changedDates);
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
    let readingOldPaths = false;
    redis.getrange.mockImplementation(async (key: string) => {
      if (key === getServicePathCacheKey(generation)) {
        readingOldPaths = true;
        return paused.promise;
      }
      return store.get(key) ?? '';
    });
    const inFlight = range();
    try {
      // Setup also reads Redis; wait for this read's established SQL snapshot.
      await vi.waitFor(() => expect(readingOldPaths).toBe(true));
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
        const scopes = [
          {},
          { stationId: 'station-1' },
          { stationId: 'station-2' },
          { lineId: 'line' },
        ];
        const expectations = await Promise.all(
          scopes.map((scope) => sqlSignals(scope)),
        );
        vi.mocked(database.getDefaultDb).mockRejectedValue(
          Error('Scoped reads must use Redis'),
        );
        for (const [index, scope] of scopes.entries()) {
          const expected = expectations[index];
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

      it('keeps slow dispatch outside publication while unrelated writers and repair finish', async () => {
        const delivery = {
          producer: 'trusted',
          externalReportId: 'slow-dispatch',
          requestPayloadDigest: 'digest',
        };
        await persistAutomoderatedProgrammaticCrowdReport(
          db,
          submission(),
          delivery,
          { now },
        );
        const candidates = await getDispatchableCrowdReportCandidates(db, {
          rootUrl: 'https://example.test',
        });
        const started = Promise.withResolvers<void>();
        const response = Promise.withResolvers<Response>();
        const fetcher = vi.fn(() => {
          started.resolve();
          return response.promise;
        });
        const dispatch = dispatchPendingCrowdReports(
          db,
          { token: 'token', rootUrl: 'https://example.test', candidates },
          fetcher,
        );
        await started.promise;
        const ready = await liveRedis.get(
          signalCache.getCommunitySignalCacheKey(),
        );
        try {
          expect((await signalCache.readCachedCommunitySignals()).status).toBe(
            'ready',
          );
          // The incident lock still excludes a second send of the same candidate.
          const duplicate = await dispatchPendingCrowdReports(
            db,
            { token: 'token', rootUrl: 'https://example.test', candidates },
            fetcher,
          );
          expect(duplicate.results[0].skipped).toBe(true);
          expect(fetcher).toHaveBeenCalledTimes(1);
          const unrelated = persistAutomoderatedCrowdReport(
            db,
            { ...submission(), effect: 'crowding' },
            abuse('unrelated'),
            { now },
          );
          // A blocked global lock would time out this assertion; always release
          // the fake response in finally so failed tests cannot strand SQL work.
          await expect(
            Promise.race([
              unrelated,
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(Error('Unrelated writer blocked by dispatch')),
                  1000,
                ),
              ),
            ]),
          ).resolves.toMatchObject({ status: 'accepted' });
          await signalCache.repairCommunitySignalCache(db);
          expect((await signalCache.readCachedCommunitySignals()).status).toBe(
            'ready',
          );
          expect(
            await liveRedis.get(signalCache.getCommunitySignalCacheKey()),
          ).not.toEqual(ready);
        } finally {
          response.resolve(new Response(null, { status: 204 }));
          expect((await dispatch).failed).toBe(0);
        }
        const expected = await sqlSignals();
        expect(expected).toHaveLength(1);
        expect(expected[0].effect).toBe('crowding');
        expect(await signalCache.readCachedCommunitySignals()).toEqual({
          status: 'ready',
          signals: expected,
        });
      });

      it('keeps healthy replay snapshots and rechecks conditional repairs under the publication lock', async () => {
        const delivery = {
          producer: 'trusted',
          externalReportId: 'replay',
          requestPayloadDigest: 'digest',
        };
        const report = await persistAutomoderatedProgrammaticCrowdReport(
          db,
          submission(),
          delivery,
          { now },
        );
        const ready = await liveRedis.get(
          signalCache.getCommunitySignalCacheKey(),
        );
        const writes = vi.spyOn(liveRedis, 'set');
        const publications = vi.spyOn(liveRedis, 'duplicate');
        const readers = vi.spyOn(db, 'select');
        readers.mockClear();
        expect(
          await findProgrammaticCrowdReportRetry(db, delivery),
        ).toMatchObject({ id: report.id, created: false });
        expect(readers).toHaveBeenCalledTimes(1);
        // The persistence helper's conflict path also represents an unchanged replay.
        expect(
          await persistAutomoderatedProgrammaticCrowdReport(
            db,
            submission(),
            delivery,
            { now },
          ),
        ).toMatchObject({ id: report.id, created: false });
        expect(writes).not.toHaveBeenCalled();
        expect(publications).not.toHaveBeenCalled();
        expect(
          await liveRedis.get(signalCache.getCommunitySignalCacheKey()),
        ).toEqual(ready);
        writes.mockRestore();
        publications.mockRestore();
        readers.mockRestore();
        await liveRedis.set(
          signalCache.getCommunitySignalCacheKey(),
          JSON.stringify({ pending: 'repair' }),
        );
        // The first repair blocks at publication while a conditional repair queues
        // on the SQL lock. The latter must recheck the newly healthy snapshot.
        const publisher = liveRedis.duplicate();
        vi.spyOn(liveRedis, 'duplicate').mockReturnValueOnce(publisher);
        const watch = publisher.watch.bind(publisher);
        const started = Promise.withResolvers<void>();
        const resume = Promise.withResolvers<void>();
        vi.spyOn(publisher, 'watch').mockImplementationOnce(async (key) => {
          const result = await watch(key);
          started.resolve();
          await resume.promise;
          return result;
        });
        const first = signalCache.repairCommunitySignalCache(db);
        await started.promise;
        const second = signalCache.repairCommunitySignalCache(db, {
          onlyIfMissing: true,
        });
        resume.resolve();
        await Promise.all([first, second]);
        expect(await signalCache.readCachedCommunitySignals()).toEqual({
          status: 'ready',
          signals: await sqlSignals(),
        });
        // Only the first repair needs a dedicated WATCH connection.
        expect(liveRedis.duplicate).toHaveBeenCalledTimes(1);
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
