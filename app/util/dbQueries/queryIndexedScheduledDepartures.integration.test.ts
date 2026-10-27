import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashBytes, queryRetainedScheduledDepartures } from '@mrtdown/fs';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { relations } from '~/db/relations';
import {
  scheduledDepartureDaysTable as days,
  scheduledDepartureOccurrencesTable as occurrences,
  scheduledDepartureProjectionsTable as projections,
} from '~/db/scheduledDepartures.schema';
import { scheduledTimetablesTable as timetables } from '~/db/scheduledTimetables.schema';
import {
  lineServicesTable,
  metadataTable,
  serviceRevisionsTable,
  stationPlatformsTable,
} from '~/db/schema';
import { scheduledTimetableArchiveFixture } from '~/workflows/pull/helpers/scheduledTimetableArchive.fixture';
import { scheduledTimetableCanonicalFixture } from '~/workflows/pull/helpers/scheduledTimetableCanonical.fixture';
import {
  finalizePull,
  insertLinesStaging,
  insertOperatorsStaging,
  insertServicesStaging,
  insertStationsStaging,
  insertTownsStaging,
  syncLines,
  syncOperatorsTownsLandmarksUpserts,
  syncServices,
  syncStationPlatformServices,
  syncStations,
} from '~/workflows/pull/helpers/stagingSync';
import { projectScheduledTimetable } from './projectScheduledTimetable';
import { queryIndexedScheduledDepartures } from './queryIndexedScheduledDepartures';
import { readLiveScheduleTopology } from './readLiveScheduleTopology';
import { retainScheduledTimetable } from './retainScheduledTimetable';
import { retentionReview } from './scheduledTimetableRetention.fixture';

const url = process.env.TEST_TIMETABLE_DATABASE_URL;
const schema = `gtfs_window_test_${randomUUID().replaceAll('-', '')}`;
const canonical = scheduledTimetableCanonicalFixture(3);
canonical.canonical.lines[0].operatingHours =
  canonical.canonical.services[0].revisions[0].operatingHours;
const path = canonical.canonical.services[0].revisions[0].path.stations;
path.splice(2, 0, { ...path[0] });
canonical.canonical.services[0].revisions.push({
  ...structuredClone(canonical.canonical.services[0].revisions[0]),
  id: 'historical',
  startAt: '1990-01-01',
  endAt: '1999-12-31',
});
canonical.canonical.operators.push({
  ...canonical.canonical.operators[0],
  id: 'former-operator',
});
canonical.canonical.lines[0].operators.push({
  operatorId: 'former-operator',
  startedAt: null,
  endedAt: '1999-12-31',
});
canonical.pattern.stops.splice(2, 0, { ...canonical.pattern.stops[0] });
const platforms = canonical.canonical.stations[0].layout?.platforms;
if (!platforms) {
  throw new Error('Missing fixture platforms');
}
platforms.push({ ...platforms[0], id: 'alternative' });
platforms.push({
  ...platforms[0],
  id: 'alighting',
  boardingStatus: 'alighting_only',
});
platforms[0].serviceIds = ['service'];
canonical.pattern.stops[0].platformIds = ['platform-1', 'alternative'];
canonical.pattern.stops[2].platformIds = ['alternative'];
const sequences = [
  '00001',
  '09007199254740993123',
  '09007199254740993124',
  '09007199254740993125',
];
const older = scheduledTimetableArchiveFixture('a', {
  topology: canonical.topology(),
  pattern: canonical.pattern,
  customize(timetable, metadata) {
    // Covers two active dates plus a genuinely covered zero-active date.
    metadata.feedRange.endDate = '2026-10-26';
    metadata.sourceFeedInfo[0].feed_end_date = '20261026';
    timetable.timetable.calendars[0].exceptions.push({
      date: '2026-10-25',
      available: true,
    });
    timetable.assignments[0].dateRanges = [
      { startDate: '2026-10-24', endDate: '2026-10-25' },
    ];
    const trip = timetable.timetable.trips[0];
    trip.providerTripId = '000-trip';
    trip.stopTimes = [87_000, null, 87_600, 88_000].map((seconds, index) => ({
      ...trip.stopTimes[0],
      providerTripId: trip.providerTripId,
      providerStopId: `00-stop-${index}`,
      stopSequence: sequences[index],
      arrivalSeconds: seconds,
      departureSeconds: seconds,
      timepoint: index === 1 ? 0 : 1,
    }));
    timetable.assignments[0].providerTripId = trip.providerTripId;
  },
});
older.entry.coverage = {
  sourceTripDateCount: 2,
  assignedTripDateCount: 2,
  missingTripDateCount: 0,
};
const release = JSON.parse(Buffer.from(older.files['release.json']).toString());
release.coverage = older.entry.coverage;
older.files['release.json'] = Buffer.from(JSON.stringify(release));
older.entry.releaseSha256 = hashBytes(older.files['release.json']);
const newer = scheduledTimetableArchiveFixture('b', {
  topology: canonical.topology(),
  pattern: canonical.pattern,
  customize(timetable, metadata) {
    metadata.feedRange = { startDate: '2026-10-25', endDate: '2026-10-25' };
    metadata.sourceFeedInfo[0].feed_start_date = '20261025';
    metadata.sourceFeedInfo[0].feed_end_date = '20261025';
    timetable.timetable.calendars[0].exceptions = [
      { date: '2026-10-25', available: true },
    ];
    timetable.assignments[0].dateRanges = [{ ...metadata.feedRange }];
    const trip = timetable.timetable.trips[0];
    trip.stopTimes = [900, null, 900, 1000].map((seconds, index) => ({
      ...trip.stopTimes[0],
      providerStopId: `00-stop-${index}`,
      stopSequence: sequences[index],
      arrivalSeconds: seconds,
      departureSeconds: seconds,
      timepoint: index === 3 ? 1 : 0,
    }));
  },
});
const scope = {
  stationId: 'station-1',
  lineId: 'line',
  serviceId: 'service',
  destinationStationId: 'station-3',
};
const window = {
  startInstant: '2026-10-25T00:00:00+08:00',
  endInstant: '2026-10-25T01:00:00+08:00',
};

describe.skipIf(!url)('indexed departure window', () => {
  let admin: Pool;
  let pool: Pool;
  let directory: string;
  const db = () => drizzle({ client: pool, relations });
  const options = () => ({
    ...window,
    scope,
  });
  const shared = () => ({
    ...window,
    scope,
    storeDir: join(directory, 'store'),
    dataDir: join(directory, 'data'),
  });

  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema},public`,
    });
    for (const migration of [
      '20260408231014_absurd_lenny_balinger',
      '20260521104213_busy_midnight',
      '20260529122429_spicy_zombie',
      '20260721025518_milky_absorbing_man',
      '20260721032337_soft_crystal',
      '20260721035821_sloppy_lady_deathstrike',
      '20260721133009_late_angel',
      '20261024214325_superb_violations',
      '20261025200054_violet_energizer',
    ]) {
      await pool.query(
        (
          await readFile(
            new URL(
              `../../../drizzle/${migration}/migration.sql`,
              import.meta.url,
            ),
            'utf8',
          )
        ).replaceAll('"public".', `"${schema}".`),
      );
    }
    directory = await mkdtemp(join(tmpdir(), 'mrtdown-window-test-'));
    for (const [path, bytes] of Object.entries(canonical.archive().files)) {
      const file = join(directory, path);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, bytes);
    }
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE scheduled_timetables CASCADE');
    await pool.query(
      'TRUNCATE operators, towns, lines, stations, services, metadata CASCADE',
    );
    const hashed = <T extends { id: string }>(rows: T[]) =>
      rows.map((row) => ({
        ...row,
        hash: hashBytes(Buffer.from(JSON.stringify(row))),
      }));
    const entities = canonical.canonical;
    await insertOperatorsStaging(db(), hashed(entities.operators));
    await insertTownsStaging(
      db(),
      hashed([{ id: 'town', name: entities.operators[0].name }]),
    );
    await insertLinesStaging(db(), hashed(entities.lines));
    await insertStationsStaging(db(), hashed(entities.stations));
    await insertServicesStaging(db(), hashed(entities.services));
    await syncOperatorsTownsLandmarksUpserts(db());
    await syncLines(db());
    await syncStations(db());
    await syncServices(db());
    await syncStationPlatformServices(db());
    await finalizePull(db());
    await rm(join(directory, 'store'), { recursive: true, force: true });
    for (const bundle of [older, newer]) {
      const retained = await retainScheduledTimetable(db(), bundle, {
        importInstant: '2026-10-25T00:03:00Z',
        sourceReview: retentionReview(
          bundle,
          bundle === newer ? older : undefined,
        ),
      });
      if (retained.status === 'blocked') {
        throw new Error(retained.blockers.join(', '));
      }
      await projectScheduledTimetable(db(), {
        manifestSha256: bundle.entry.manifestSha256,
        projectorVersion: 1,
        canonicalDataDir: shared().dataDir,
      });
      const version = join(shared().storeDir, bundle.entry.manifestSha256);
      await mkdir(version, { recursive: true });
      for (const [name, bytes] of Object.entries(bundle.files)) {
        await writeFile(join(version, name), bytes);
      }
      await writeFile(
        join(version, 'import.json'),
        JSON.stringify(retained.record),
      );
    }
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('merges previous-day 24+ and current-day departures before limiting, with date-specific fallback and opaque repeated occurrence order', async () => {
    const readCanonicalTopology = vi.fn(readLiveScheduleTopology);
    const result = await queryIndexedScheduledDepartures(db(), {
      ...options(),
      readCanonicalTopology,
    });
    expect(readCanonicalTopology).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(await readCanonicalTopology.mock.results[0].value),
    ).toBe(JSON.stringify(canonical.topology()));
    expect(result.complete).toBe(true);
    expect(result.departures).toEqual(
      (await queryRetainedScheduledDepartures(shared())).departures,
    );
    expect(
      result.departures.map((row) => [
        row.serviceDate,
        row.departureSeconds,
        row.stopSequence,
      ]),
    ).toEqual([
      ['2026-10-24', 87_000, sequences[0]],
      ['2026-10-25', 900, sequences[0]],
      ['2026-10-25', 900, sequences[2]],
      ['2026-10-24', 87_600, sequences[2]],
    ]);
    expect(
      result.serviceDays.map((day) => [
        day.serviceDate,
        day.selected?.version.manifestSha256,
        day.attempts.map(({ reason }) => reason),
      ]),
    ).toEqual([
      [
        '2026-10-24',
        older.entry.manifestSha256,
        ['outside-feed-range', 'eligible'],
      ],
      ['2026-10-25', newer.entry.manifestSha256, ['eligible']],
    ]);
    expect(
      (await queryIndexedScheduledDepartures(db(), { ...options(), limit: 2 }))
        .departures,
    ).toEqual(result.departures.slice(0, 2));
    const fractional = {
      ...options(),
      startInstant: '2026-10-25T00:10:00.000000001+08:00',
      endInstant: '2026-10-25T00:15:00.000000001+08:00',
    };
    expect(
      (await queryIndexedScheduledDepartures(db(), fractional)).departures,
    ).toEqual(
      (await queryRetainedScheduledDepartures({ ...shared(), ...fractional }))
        .departures,
    );
    const platform = await queryIndexedScheduledDepartures(db(), {
      ...options(),
      scope: { ...scope, platformId: 'platform-1' },
    });
    expect(platform.complete).toBe(true);
    expect(platform.departures).toEqual(
      result.departures.filter(({ platformIds }) =>
        platformIds.includes('platform-1'),
      ),
    );
    expect(platform.departures[1]).toMatchObject({
      basis: 'scheduled',
      precision: 'approximate',
      platformIds: ['alternative', 'platform-1'],
    });
    expect(
      (
        await queryIndexedScheduledDepartures(db(), {
          ...options(),
          startInstant: '2026-10-25T00:10:00+08:00',
          endInstant: '2026-10-25T00:15:00+08:00',
        })
      ).departures,
    ).toEqual(result.departures.slice(0, 1));
  });

  it('distinguishes untimed, missing, whole-source mapping gaps and covered empty dates without truncating counts', async () => {
    const untimedScope = { ...scope, stationId: 'station-2' };
    const untimed = await queryIndexedScheduledDepartures(db(), {
      ...options(),
      scope: untimedScope,
      limit: 1,
    });
    expect(untimed).toMatchObject({
      departures: [],
      untimedDepartureCount: 2,
      complete: false,
    });
    expect(untimed.untimedDepartureCount).toBe(
      (
        await queryRetainedScheduledDepartures({
          ...shared(),
          scope: untimedScope,
        })
      ).untimedDepartureCount,
    );
    const empty = await queryIndexedScheduledDepartures(db(), {
      ...options(),
      startInstant: '2026-10-26T12:00:00+08:00',
      endInstant: '2026-10-26T13:00:00+08:00',
    });
    expect(empty).toMatchObject({
      departures: [],
      complete: true,
      untimedDepartureCount: 0,
    });
    expect(empty.serviceDays[0].selected?.coverage.activeTripCount).toBe(0);
    const wrongScope = await queryIndexedScheduledDepartures(db(), {
      ...options(),
      scope: { ...scope, destinationStationId: 'station-2' },
    });
    expect(wrongScope).toMatchObject({ departures: [], complete: false });
    expect(
      wrongScope.serviceDays.every(
        (day) =>
          day.selected === null &&
          day.attempts.at(-1)?.reason === 'scope-not-covered',
      ),
    ).toBe(true);
    const [current] = await db()
      .select()
      .from(projections)
      .where(eq(projections.manifest_sha256, newer.entry.manifestSha256));
    await db()
      .update(days)
      .set({ unassigned_active_trip_count: 1 })
      .where(eq(days.projection_id, current.id));
    const fallback = await queryIndexedScheduledDepartures(db(), options());
    expect(
      fallback.serviceDays[1].attempts.map(({ reason }) => reason),
    ).toEqual(['mapping-coverage-gap', 'eligible']);
    expect(fallback.serviceDays[1].selected?.version.manifestSha256).toBe(
      older.entry.manifestSha256,
    );
    await db().delete(days);
    const missing = await queryIndexedScheduledDepartures(db(), options());
    expect(missing).toMatchObject({ departures: [], complete: false });
    expect(
      missing.serviceDays.every(
        (day) =>
          day.selected === null &&
          day.attempts.at(-1)?.reason === 'day-not-indexed',
      ),
    ).toBe(true);
    await db().update(projections).set({ completed_at: null });
    expect(
      await queryIndexedScheduledDepartures(db(), options()),
    ).toMatchObject({
      complete: false,
      unavailableProjections: [
        expect.objectContaining({ reason: 'projection-incomplete' }),
        expect.objectContaining({ reason: 'projection-incomplete' }),
      ],
    });
  });

  it('holds one read-only repeatable-read snapshot across topology promotion, history changes and rebuilt occurrence rows for every candidate date', async () => {
    const before = await queryIndexedScheduledDepartures(db(), options());
    const result = await queryIndexedScheduledDepartures(db(), {
      ...options(),
      readCanonicalTopology: async (tx) => {
        const isolation = await tx.execute<{ transaction_isolation: string }>(
          sql`SHOW transaction_isolation`,
        );
        const access = await tx.execute<{ transaction_read_only: string }>(
          sql`SHOW transaction_read_only`,
        );
        expect(isolation.rows[0].transaction_isolation).toBe('repeatable read');
        expect(access.rows[0].transaction_read_only).toBe('on');
        const topology = await readLiveScheduleTopology(tx);
        await syncOperatorsTownsLandmarksUpserts(db());
        await db().transaction(async (writer) => {
          await writer.update(stationPlatformsTable).set({ label: 'Changed' });
          await writer
            .update(projections)
            .set({ completed_at: null, maximum_departure_seconds: 0 });
          await writer.delete(occurrences);
          await writer.delete(days);
          await writer.delete(projections);
          await writer.delete(timetables);
        });
        expect(await readLiveScheduleTopology(tx)).toEqual(topology);
        return topology;
      },
    });
    expect(result).toEqual(before);
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('completed promotion');
    expect(await db().select().from(occurrences)).toEqual([]);
    expect(await db().select().from(timetables)).toEqual([]);
  });

  it('rejects partial or failed promotions even with matching candidate topology, and compares actual live state after finalization', async () => {
    await db().delete(metadataTable);
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('completed promotion');
    await finalizePull(db());
    expect(
      (await queryIndexedScheduledDepartures(db(), options())).complete,
    ).toBe(true);
    // The first real promotion phase invalidates eligibility in the same commit.
    // An expired/deleted workflow lease cannot restore it after a later failure.
    await syncOperatorsTownsLandmarksUpserts(db());
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('completed promotion');
    await db().update(stationPlatformsTable).set({ label: 'Changed' });
    await finalizePull(db());
    const changed = await queryIndexedScheduledDepartures(db(), options());
    expect(changed).toMatchObject({ complete: false, departures: [] });
    expect(changed.serviceDays[0].attempts.map(({ reason }) => reason)).toEqual(
      ['topology-mismatch', 'topology-mismatch'],
    );
  });

  it('fails closed on insufficient revision dates and inconsistent normalized relationships or path order', async () => {
    await db()
      .update(serviceRevisionsTable)
      .set({ start_at: null })
      .where(eq(serviceRevisionsTable.id, 'revision'));
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow();
    await db()
      .update(serviceRevisionsTable)
      .set({ start_at: '2000-01-01' })
      .where(eq(serviceRevisionsTable.id, 'revision'));
    await pool.query(
      'UPDATE service_revision_path_station_entries SET path_index = 10 WHERE path_index = 1',
    );
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('path order');
    await pool.query(
      'UPDATE service_revision_path_station_entries SET path_index = 1 WHERE path_index = 10',
    );
    await db().delete(lineServicesTable);
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('missing a line service');
    await pool.query('TRUNCATE operators CASCADE');
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('requires operators');
  });

  it('rejects invalid instants, order, duration, limit and strict scope before opening a snapshot', async () => {
    const database = db();
    const transaction = vi.spyOn(database, 'transaction');
    for (const patch of [
      { startInstant: 'not-an-instant' },
      { endInstant: window.startInstant },
      { endInstant: '2026-10-24T00:00:00Z' },
      { endInstant: '2026-10-26T00:00:01+08:00' },
      { endInstant: '2026-10-26T00:00:00.000000001+08:00' },
      { limit: 0 },
      { limit: 1.5 },
      { scope: { ...scope, unexpected: true } },
    ]) {
      await expect(
        queryIndexedScheduledDepartures(database, { ...options(), ...patch }),
      ).rejects.toThrow();
    }
    expect(transaction).not.toHaveBeenCalled();
  });
});
