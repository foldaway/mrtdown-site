import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StationLayoutPlatformSchema } from '@mrtdown/core';
import {
  hashBytes,
  queryRetainedScheduledDepartures,
  scheduleTopologyProjection,
} from '@mrtdown/fs';
import { DateTime } from 'luxon';
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
  crowdArrivalReportsTable,
  publicHolidaysTable,
  stationsTable,
  servicesTable,
  lineServicesTable,
  linesNextTable,
  linesTable,
  metadataTable,
  serviceRevisionsTable,
  stationPlatformsTable,
} from '~/db/schema';
import {
  getCanonicalManifestFingerprint,
  isCanonicalManifestCurrent,
  recordCanonicalManifestFingerprint,
} from '~/workflows/pull/helpers/manifestFingerprint';
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
import * as database from './database';
import { buildDataset } from './dataset';
import { getTownProfileReadModel } from './towns';
import { buildLineSummary, buildUptimeGraph } from './lineAnalytics';
import { isLineOperatingNow, isLineFuture } from './serviceOperations';
import { buildLineOperationalFactRows } from './operationalFacts';
import { projectScheduledTimetable } from './projectScheduledTimetable';
import { queryIndexedScheduledDepartures } from './queryIndexedScheduledDepartures';
import { readStationArrivalSource } from './readStationArrivalSource';
import { readLiveScheduleTopology } from './readLiveScheduleTopology';
import { retainScheduledTimetable } from './retainScheduledTimetable';
import { retentionReview } from './scheduledTimetableRetention.fixture';

const url = process.env.TEST_TIMETABLE_DATABASE_URL;
const schema = `gtfs_window_test_${randomUUID().replaceAll('-', '')}`;
const canonical = scheduledTimetableCanonicalFixture(3);
canonical.canonical.lines[0].operatingHours =
  canonical.canonical.services[0].revisions[0].operatingHours;
canonical.canonical.services[0].revisions[0].estimatedFrequency = {
  source: {
    url: 'https://example.com/frequency',
    description: 'Test profile',
    retrievedAt: '2026-10-24',
  },
  defaultHeadway: {
    minSeconds: 600,
    maxSeconds: 600,
    representativeSeconds: 600,
  },
  periods: [],
};
canonical.canonical.stations[0].firstLastTrain = {
  services: [
    {
      serviceId: 'service',
      times: {
        weekday: { firstTrain: '05:00:00', lastTrain: '06:00:00' },
        sunday_public_holiday: {
          firstTrain: '06:00:00',
          lastTrain: '07:00:00',
        },
      },
    },
  ],
};
canonical.canonical.stations[1].firstLastTrain =
  canonical.canonical.stations[0].firstLastTrain;
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
const hashed = <T extends { id: string }>(rows: T[]) =>
  rows.map((row) => ({
    ...row,
    hash: hashBytes(Buffer.from(JSON.stringify(row))),
  }));

describe.skipIf(!url)('indexed departure window', () => {
  let admin: Pool;
  let pool: Pool;
  let directory: string;
  let canonicalTopologyComplete = false;
  const db = () => drizzle({ client: pool, relations });
  const finalize = () => finalizePull(db(), { canonicalTopologyComplete });
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
      '20260518155031_curious_vision',
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
    await pool.query('TRUNCATE scheduled_timetables, public_holidays CASCADE');
    await pool.query(
      'TRUNCATE operators, towns, lines, stations, services, metadata CASCADE',
    );
    const entities = canonical.canonical;
    await insertOperatorsStaging(db(), hashed(entities.operators));
    await insertTownsStaging(
      db(),
      hashed([{ id: 'town', name: entities.operators[0].name }]),
    );
    canonicalTopologyComplete =
      (await insertLinesStaging(db(), hashed(entities.lines))) ===
      entities.lines.length;
    await insertStationsStaging(db(), hashed(entities.stations));
    await insertServicesStaging(db(), hashed(entities.services));
    await syncOperatorsTownsLandmarksUpserts(db());
    await syncLines(db());
    await syncStations(db());
    await syncServices(db());
    await syncStationPlatformServices(db());
    await finalize();
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

  it('reads real scheduled arrivals and display metadata in the same snapshot, including complete empty coverage', async () => {
    const request = {
      scope,
      referenceInstant: window.startInstant,
      endInstant: window.endInstant,
    };
    const before = await readStationArrivalSource(db(), request);
    expect(before).toMatchObject({ source: 'scheduled', reason: 'complete' });
    const timings = before.scheduled.lines[0].arrivalTimings;
    expect(timings).toHaveLength(2);
    expect(timings[0]).toMatchObject({
      destinationCode: 'T3',
      destinationName: canonical.canonical.stations[2].name,
      platformIds: ['alternative', 'platform-1'],
      platformLabels: ['A', 'A'],
    });
    expect(timings[0].departures[1]).toMatchObject({
      basis: 'scheduled',
      precision: 'approximate',
      time: '2026-10-24T16:15:00Z',
      manifestSha256: newer.entry.manifestSha256,
    });
    expect(timings.flatMap(({ departures }) => departures)).toHaveLength(4);
    expect(
      await readStationArrivalSource(db(), {
        scope,
        referenceInstant: '2026-10-26T12:00:00+08:00',
        endInstant: '2026-10-26T13:00:00+08:00',
      }),
    ).toMatchObject({
      source: 'scheduled',
      reason: 'complete',
      scheduled: { lines: [{ arrivalTimings: [] }] },
    });
    const concurrent = await readStationArrivalSource(db(), {
      ...request,
      readCanonicalTopology: async (tx) => {
        const topology = await readLiveScheduleTopology(tx);
        await db()
          .update(stationsTable)
          .set({
            name: {
              ...canonical.canonical.stations[0].name,
              'en-SG': 'Changed destination',
            },
          });
        await db()
          .update(servicesTable)
          .set({
            name: {
              ...canonical.canonical.services[0].name,
              'en-SG': 'Changed service',
            },
          });
        await db()
          .update(stationPlatformsTable)
          .set({ label: 'Changed platform' });
        await db().delete(projections);
        await db().delete(timetables);
        return topology;
      },
    });
    expect(concurrent).toEqual(before);
  });

  it('uses the actual revision, holiday times and current crowd phase for no-artifact fallback within the request window', async () => {
    await db().delete(projections);
    await db().delete(timetables);
    const request = {
      scope: { ...scope, stationId: 'station-2' },
      referenceInstant: '2026-10-25T22:04:00Z',
      endInstant: '2026-10-26T06:16:00+08:00',
    };
    // The weekday service has ended; tomorrow's first estimates are outside this window.
    expect(await readStationArrivalSource(db(), request)).toMatchObject({
      source: 'unavailable',
      reason: 'frequency-unavailable',
    });
    await db().insert(publicHolidaysTable).values({
      id: 'test-holiday',
      date: '2026-10-26',
      holiday_name: 'Test holiday',
      hash: 'test',
    });
    await db()
      .insert(crowdArrivalReportsTable)
      .values([
        {
          id: 'phase',
          station_id: request.scope.stationId,
          service_id: scope.serviceId,
          reported_at: request.referenceInstant,
          minutes_to_arrival: 2,
          reporter_hash: 'test',
        },
        {
          id: 'future-phase',
          station_id: request.scope.stationId,
          service_id: scope.serviceId,
          reported_at: '2026-10-26T06:05:00+08:00',
          minutes_to_arrival: 0,
          reporter_hash: 'test',
        },
      ]);
    const fallback = await readStationArrivalSource(db(), {
      ...request,
      readCanonicalTopology: async (tx) => {
        const topology = await readLiveScheduleTopology(tx);
        await db()
          .update(serviceRevisionsTable)
          .set({ estimated_frequency: null });
        await db().delete(publicHolidaysTable);
        await db().delete(crowdArrivalReportsTable);
        return topology;
      },
    });
    expect(fallback.source).toBe('frequency');
    if (fallback.source !== 'frequency') {
      throw new Error('Expected frequency fallback');
    }
    expect(
      fallback.scheduled.serviceDays.every(
        ({ attempts }) => attempts.length === 0,
      ),
    ).toBe(true);
    expect(fallback.frequency).toMatchObject({
      stationId: request.scope.stationId,
      window: {
        startInstant: request.referenceInstant,
        endInstant: request.endInstant,
      },
      timing: {
        serviceId: scope.serviceId,
        lineId: scope.lineId,
        destinationStationId: scope.destinationStationId,
        firstTrainTime: '06:00:00',
        lastTrainTime: '07:00:00',
        departures: [
          {
            time: '2026-10-26T06:06:00.000+08:00',
            basis: 'crowd_report',
            crowdReportCount: 1,
            headwaySeconds: 600,
          },
        ],
      },
    });
    expect(fallback.frequency.timing.departures).toHaveLength(1);
  });

  it('keeps partial schedules, rejects unavailable projections and unsupported fallback contexts, and propagates promotion errors', async () => {
    const request = {
      scope,
      referenceInstant: window.startInstant,
      endInstant: window.endInstant,
    };
    await db()
      .update(days)
      .set({ unassigned_active_trip_count: 1 })
      .where(eq(days.service_date, '2026-10-24'));
    const partial = await readStationArrivalSource(db(), request);
    expect(partial).toMatchObject({
      source: 'scheduled',
      reason: 'incomplete',
      scheduled: { complete: false },
    });
    expect(
      partial.scheduled.lines[0].arrivalTimings.flatMap(
        ({ departures }) => departures,
      ),
    ).toHaveLength(2);
    await db().update(projections).set({ completed_at: null });
    expect(await readStationArrivalSource(db(), request)).toMatchObject({
      source: 'unavailable',
      reason: 'timetable-unavailable',
    });
    await db()
      .update(timetables)
      .set({ manifest_bytes: Buffer.from('{}') });
    await expect(readStationArrivalSource(db(), request)).rejects.toThrow();
    await db().delete(projections);
    await db().delete(timetables);
    expect(
      await readStationArrivalSource(db(), {
        ...request,
        scope: { ...scope, platformId: 'platform-1' },
      }),
    ).toMatchObject({ source: 'unavailable', reason: 'frequency-unavailable' });
    const morning = {
      ...request,
      scope: { ...scope, stationId: 'station-2' },
      referenceInstant: '2026-10-26T05:04:00+08:00',
      endInstant: '2026-10-26T05:30:00+08:00',
    };
    expect(
      await readStationArrivalSource(db(), {
        ...morning,
        scope: { ...morning.scope, destinationStationId: 'station-1' },
      }),
    ).toMatchObject({ source: 'unavailable', reason: 'frequency-unavailable' });
    expect(await readStationArrivalSource(db(), morning)).toMatchObject({
      source: 'frequency',
    });
    await db()
      .update(serviceRevisionsTable)
      .set({ start_at: '2026-10-26' })
      .where(eq(serviceRevisionsTable.id, 'revision'));
    expect(await readStationArrivalSource(db(), morning)).toMatchObject({
      source: 'unavailable',
      reason: 'frequency-unavailable',
    });
    await db().delete(metadataTable);
    await expect(readStationArrivalSource(db(), morning)).rejects.toThrow(
      'completed promotion',
    );
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
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('completed promotion');
    await finalize();
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
    await finalize();
    const changed = await queryIndexedScheduledDepartures(db(), options());
    expect(changed).toMatchObject({ complete: false, departures: [] });
    expect(changed.serviceDays[0].attempts.map(({ reason }) => reason)).toEqual(
      ['topology-mismatch', 'topology-mismatch'],
    );
  });

  it('promotes unknown line fields and preserves the full shared topology and conservative readers', async () => {
    const incoming = hashed(
      canonical.canonical.lines.map((line) => ({
        ...line,
        startedAt: null,
        operatingHours: undefined,
      })),
    );
    canonicalTopologyComplete =
      (await insertLinesStaging(db(), incoming)) === incoming.length;
    expect(canonicalTopologyComplete).toBe(true);
    expect(await db().select().from(linesNextTable)).toMatchObject([
      {
        id: 'line',
        started_at: null,
        operating_hours: null,
        operators: incoming[0].operators,
      },
    ]);
    await syncOperatorsTownsLandmarksUpserts(db());
    await syncLines(db());
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('completed promotion');
    await finalize();
    expect(await db().select().from(linesTable)).toMatchObject([
      { id: 'line', started_at: null, operating_hours: null },
    ]);
    await db().transaction(async (tx) => {
      expect(await readLiveScheduleTopology(tx)).toEqual(canonical.topology());
    });
    // Top-level dates/hours are not part of the producer's topology identity.
    expect(
      (await queryIndexedScheduledDepartures(db(), options())).complete,
    ).toBe(true);
    const referenceNow = DateTime.fromISO('2026-10-25T12:00:00+08:00', {
      zone: 'Asia/Singapore',
    });
    const dataset = await buildDataset(referenceNow, db(), []);
    const line = dataset.included.lines.line;
    expect(line.startedAt).toBeNull();
    expect(line.operatingHours).toBeUndefined();
    expect(isLineFuture(line, referenceNow)).toBe(false);
    expect(isLineOperatingNow(line, new Set(), referenceNow)).toBe(false);
    expect(
      buildLineSummary(line, [], 1, new Set(), referenceNow),
    ).toMatchObject({
      status: 'unknown',
      uptimeRatio: null,
      totalServiceSeconds: null,
    });
    expect(buildUptimeGraph(line, [], new Set(), 7).data).toEqual([]);
    expect(
      buildLineOperationalFactRows(
        line,
        [],
        referenceNow.startOf('day'),
        new Set(),
        referenceNow,
      ),
    ).toMatchObject({
      lineRow: { service_seconds: 0 },
      intervalRows: [],
    });

    const defaultDb = vi
      .spyOn(database, 'getDefaultDb')
      .mockResolvedValue(db());
    try {
      const town = await getTownProfileReadModel('town');
      expect(town.data.status).toBe('unknown');
      expect(Object.values(town.data.stationStatuses)).toEqual([
        'unknown',
        'unknown',
        'unknown',
      ]);
    } finally {
      defaultDb.mockRestore();
    }

    const extraLines = hashed([
      {
        ...incoming[0],
        id: 'unknown-start',
        operatingHours: canonical.canonical.lines[0].operatingHours,
        serviceIds: [],
      },
      {
        ...canonical.canonical.lines[0],
        id: 'unknown-hours',
        operatingHours: undefined,
        serviceIds: [],
      },
    ]);
    const allLines = [...incoming, ...extraLines];
    canonicalTopologyComplete =
      (await insertLinesStaging(db(), allLines)) === allLines.length;
    await syncOperatorsTownsLandmarksUpserts(db());
    await syncLines(db());
    // Missing or false confirmation must still fail closed, even with all lines retained.
    await finalizePull(db(), { canonicalTopologyComplete: false });
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('completed promotion');
    await finalizePull(db(), { canonicalTopologyComplete });
    await db().transaction(async (tx) => {
      expect(await readLiveScheduleTopology(tx)).toEqual(
        scheduleTopologyProjection({
          ...canonical.canonical,
          lines: allLines,
        }),
      );
    });
    const changed = await queryIndexedScheduledDepartures(db(), options());
    expect(changed).toMatchObject({ complete: false, departures: [] });
    expect(changed.serviceDays[0].attempts.map(({ reason }) => reason)).toEqual(
      ['topology-mismatch', 'topology-mismatch'],
    );
    expect(
      await db().select({ id: projections.id }).from(projections),
    ).toHaveLength(2);
  });

  it('reimports a previous successful manifest after an interrupted promotion, then skips it after recovery completes', async () => {
    const fingerprint = getCanonicalManifestFingerprint(
      canonical.archive().manifest,
    );
    await db()
      .insert(metadataTable)
      .values({ key: 'canonical_manifest_fingerprint_v5', value: fingerprint });
    expect(await isCanonicalManifestCurrent(db(), fingerprint)).toBe(false);
    await recordCanonicalManifestFingerprint(db(), fingerprint);
    expect(await isCanonicalManifestCurrent(db(), fingerprint)).toBe(true);
    const before = await queryIndexedScheduledDepartures(db(), options());

    const nextStations = structuredClone(canonical.canonical.stations);
    for (const station of nextStations) {
      for (const platform of station.layout?.platforms ?? []) {
        platform.label = 'Interrupted promotion';
      }
    }
    await insertStationsStaging(db(), hashed(nextStations));
    await syncOperatorsTownsLandmarksUpserts(db());
    await syncStations(db());
    expect(await isCanonicalManifestCurrent(db(), fingerprint)).toBe(false);
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('completed promotion');

    await pool.query('TRUNCATE stations_next');
    await insertStationsStaging(db(), hashed(canonical.canonical.stations));
    await syncStations(db());
    await syncStationPlatformServices(db());
    await finalize();
    expect(await queryIndexedScheduledDepartures(db(), options())).toEqual(
      before,
    );
    expect(await isCanonicalManifestCurrent(db(), fingerprint)).toBe(false);
    await recordCanonicalManifestFingerprint(db(), fingerprint);
    expect(await isCanonicalManifestCurrent(db(), fingerprint)).toBe(true);
  });

  it('fails closed on insufficient revision dates and inconsistent normalized relationships or path order', async () => {
    const invalidPlatform = {
      ...platforms[0],
      boardingStatus: 'alighting_only',
    };
    expect(StationLayoutPlatformSchema.safeParse(invalidPlatform).success).toBe(
      false,
    );
    await db()
      .update(stationPlatformsTable)
      .set({ boarding_status: 'alighting_only' })
      .where(eq(stationPlatformsTable.platform_id, 'platform-1'));
    await expect(
      queryIndexedScheduledDepartures(db(), options()),
    ).rejects.toThrow('inconsistent platform services');
    await db()
      .update(stationPlatformsTable)
      .set({ boarding_status: null })
      .where(eq(stationPlatformsTable.platform_id, 'platform-1'));
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
