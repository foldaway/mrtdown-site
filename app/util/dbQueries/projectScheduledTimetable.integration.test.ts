import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hashBytes,
  queryRetainedScheduledDepartures,
  type ScheduledTimetableRequestScope,
  selectRetainedScheduledTimetable,
} from '@mrtdown/fs';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { relations } from '~/db/relations';
import {
  scheduledDepartureDaysTable as days,
  scheduledDepartureOccurrencesTable as occurrences,
  scheduledDepartureProjectionsTable as projections,
  scheduledDepartureScopesTable as scopes,
} from '~/db/scheduledDepartures.schema';
import { scheduledTimetablesTable as timetables } from '~/db/scheduledTimetables.schema';
import { scheduledTimetableArchiveFixture } from '~/workflows/pull/helpers/scheduledTimetableArchive.fixture';
import { scheduledTimetableCanonicalFixture } from '~/workflows/pull/helpers/scheduledTimetableCanonical.fixture';
import { projectScheduledTimetable } from './projectScheduledTimetable';
import { retainScheduledTimetable } from './retainScheduledTimetable';
import { retentionReview } from './scheduledTimetableRetention.fixture';
import { withSelectedScheduledTimetable } from './withSelectedScheduledTimetable';

const url = process.env.TEST_TIMETABLE_DATABASE_URL;
const schema = `gtfs_projector_test_${randomUUID().replaceAll('-', '')}`;
const canonical = scheduledTimetableCanonicalFixture(3);
const platforms = canonical.canonical.stations[0].layout?.platforms;
if (platforms) {
  platforms.push({ ...platforms[0], id: 'alternative' });
}
const bundle = scheduledTimetableArchiveFixture('a', {
  topology: canonical.topology(),
  pattern: canonical.pattern,
  customize(timetable, metadata) {
    metadata.feedRange.endDate = '2026-10-26';
    metadata.sourceFeedInfo[0].feed_end_date = '20261026';
    timetable.timetable.calendars[0].exceptions.push({
      date: '2026-10-26',
      available: true,
    });
    const trip = timetable.timetable.trips[0];
    trip.stopTimes = [90_000, null, 100_000].map((seconds, index) => ({
      providerTripId: trip.providerTripId,
      providerStopId: `00-stop-${index}`,
      stopSequence: ['00001', '09007199254740993123', '09007199254740993124'][
        index
      ],
      arrivalSeconds: seconds,
      departureSeconds: seconds,
      pickupType: index === 2 ? 1 : 0,
      dropOffType: 0,
      timepoint: index === 1 ? 0 : 1,
    }));
    const alternate = structuredClone(canonical.pattern);
    alternate.stops[0].platformIds = ['alternative'];
    timetable.patterns.push({ id: 'alternate', pattern: alternate });
    // 502 occurrences on each active date cross the writer's batch boundary.
    timetable.timetable.trips = Array.from({ length: 251 }, (_, index) => {
      const id = index ? `000-trip-${index}` : 'trip';
      return {
        ...trip,
        providerTripId: id,
        stopTimes: trip.stopTimes.map((stop) => ({
          ...stop,
          providerTripId: id,
        })),
      };
    });
    timetable.assignments = timetable.timetable.trips.flatMap(
      ({ providerTripId }) => [
        {
          providerTripId,
          patternId: 'pattern',
          dateRanges: [{ startDate: '2026-10-24', endDate: '2026-10-24' }],
        },
        {
          providerTripId,
          patternId: 'alternate',
          dateRanges: [{ startDate: '2026-10-26', endDate: '2026-10-26' }],
        },
      ],
    );
    timetable.timetable.calendars.push({
      providerCalendarId: 'unassigned',
      weekly: null,
      exceptions: [{ date: '2026-10-26', available: true }],
    });
    timetable.timetable.trips.push({
      ...trip,
      providerCalendarId: 'unassigned',
      providerTripId: 'unassigned',
      stopTimes: trip.stopTimes.map((stop) => ({
        ...stop,
        providerTripId: 'unassigned',
      })),
    });
  },
});

bundle.entry.coverage = {
  sourceTripDateCount: 503,
  assignedTripDateCount: 502,
  missingTripDateCount: 1,
};
const report = JSON.parse(Buffer.from(bundle.files['release.json']).toString());
report.coverage = bundle.entry.coverage;
bundle.files['release.json'] = Buffer.from(JSON.stringify(report));
bundle.entry.releaseSha256 = hashBytes(bundle.files['release.json']);

describe.skipIf(!url)('retained timetable projector', () => {
  let admin: Pool;
  let pool: Pool;
  let directory: string;
  const db = () => drizzle({ client: pool, relations });
  const storedOccurrences = () =>
    db()
      .select()
      .from(occurrences)
      .orderBy(
        occurrences.service_date,
        occurrences.provider_trip_id,
        occurrences.occurrence_index,
      );
  const storedProjection = async (id: number) =>
    (await db().select().from(projections).where(eq(projections.id, id)))[0];
  const options = () => ({
    manifestSha256: bundle.entry.manifestSha256,
    projectorVersion: 1 as const,
    canonicalDataDir: join(directory, 'data'),
  });
  const scope = {
    stationId: 'station-1',
    lineId: 'line',
    serviceId: 'service',
    destinationStationId: 'station-3',
    platformId: 'alternative',
  };
  const shared = () => ({
    storeDir: join(directory, 'store'),
    dataDir: options().canonicalDataDir,
    scope,
  });

  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
    });
    for (const migration of [
      '20261024214325_superb_violations',
      '20261025200054_violet_energizer',
    ]) {
      await pool.query(
        await readFile(
          new URL(
            `../../../drizzle/${migration}/migration.sql`,
            import.meta.url,
          ),
          'utf8',
        ),
      );
    }
    directory = await mkdtemp(join(tmpdir(), 'mrtdown-projector-test-'));
    for (const [path, bytes] of Object.entries(canonical.archive().files)) {
      const file = join(directory, path);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, bytes);
    }
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE scheduled_timetables CASCADE');
    const retained = await retainScheduledTimetable(db(), bundle, {
      importInstant: '2026-10-24T00:03:00Z',
      sourceReview: retentionReview(bundle),
    });
    if (retained.status === 'blocked') {
      throw new Error(retained.blockers.join(', '));
    }
    const version = join(shared().storeDir, bundle.entry.manifestSha256);
    await mkdir(version, { recursive: true });
    for (const [name, bytes] of Object.entries(bundle.files)) {
      await writeFile(join(version, name), bytes);
    }
    await writeFile(
      join(version, 'import.json'),
      JSON.stringify(retained.record),
    );
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

  const select = (
    serviceDate = '2026-10-24',
    requestScope: ScheduledTimetableRequestScope = scope,
  ) =>
    withSelectedScheduledTimetable(
      db(),
      {
        serviceDate,
        scope: requestScope,
        readCanonicalTopology: async () => canonical.topology(),
      },
      async (_tx, selection) => selection,
    );

  it('selects indexed versions in reviewed order with shared scope, empty-day and fallback semantics', async () => {
    await projectScheduledTimetable(db(), options());
    const newer = scheduledTimetableArchiveFixture('b', {
      topology: canonical.topology(),
      pattern: canonical.pattern,
      customize(timetable) {
        const trip = timetable.timetable.trips[0];
        trip.stopTimes = canonical.pattern.stops.map((_, index) => ({
          ...trip.stopTimes[0],
          providerStopId: `stop-${index + 1}`,
          stopSequence: `${index + 1}`,
          arrivalSeconds: (index + 1) * 60,
          departureSeconds: (index + 1) * 60,
        }));
      },
    });
    const admitted = await retainScheduledTimetable(db(), newer, {
      // Equal import clocks and descending opaque feed versions cannot order these.
      importInstant: '2026-10-24T00:03:00Z',
      sourceReview: retentionReview(newer, bundle),
    });
    expect(admitted.status).toBe('retained');
    const newerOptions = {
      ...options(),
      manifestSha256: newer.entry.manifestSha256,
    };
    const uncovered = { ...scope, platformId: undefined };
    expect(
      (await select('2026-10-24', uncovered)).attempts.map(
        ({ reason }) => reason,
      ),
    ).toEqual(['projection-unavailable', 'eligible']);
    const next = await projectScheduledTimetable(db(), newerOptions);
    const selected = await select('2026-10-24', uncovered);
    expect(selected.selected).toMatchObject({
      projectionId: next.id,
      version: { manifestSha256: newer.entry.manifestSha256 },
      coverage: { activeTripCount: 1, unassignedActiveTripCount: 0 },
    });
    const fallback = await select();
    expect(fallback.selected?.version.manifestSha256).toBe(
      bundle.entry.manifestSha256,
    );
    expect(fallback.attempts.map(({ reason }) => reason)).toEqual([
      'scope-not-covered',
      'eligible',
    ]);
    const empty = await select('2026-10-25');
    expect(empty.selected?.coverage.activeTripCount).toBe(0);
    expect(empty.attempts[0].reason).toBe('outside-feed-range');
    expect(empty.attempts.at(-1)).toEqual(
      (
        await selectRetainedScheduledTimetable({
          ...shared(),
          serviceDate: '2026-10-25',
        })
      ).attempts.at(-1),
    );
    const gap = await select('2026-10-26');
    expect(gap.selected).toBeNull();
    expect(gap.attempts.at(-1)).toMatchObject({
      reason: 'mapping-coverage-gap',
      activeTripCount: 252,
      unassignedActiveTripCount: 1,
    });
    expect(gap.attempts.at(-1)).toEqual(
      (
        await selectRetainedScheduledTimetable({
          ...shared(),
          serviceDate: '2026-10-26',
        })
      ).attempts.at(-1),
    );
    expect(
      (await select('2026-10-24', { ...uncovered, stationId: 'station-3' }))
        .selected,
    ).toBeNull();
    expect(
      (
        await select('2026-10-24', {
          ...uncovered,
          destinationStationId: 'station-2',
        })
      ).attempts.every(({ reason }) => reason === 'scope-not-covered'),
    ).toBe(true);
    await expect(select('2026-02-30')).rejects.toThrow();
    await expect(
      select('2026-10-24', { ...scope, platformId: 'platform-2' }),
    ).rejects.toThrow('platform does not belong');
    await expect(
      select('2026-10-24', { ...scope, serviceId: 'unknown' }),
    ).rejects.toThrow('unknown canonical');

    for (const [patch, reason] of [
      [{ completed_at: null }, 'projection-incomplete'],
      [{ topology_sha256: 'f'.repeat(64) }, 'topology-mismatch'],
      [{ topology_projection_version: 2 }, 'topology-mismatch'],
      [{ projector_version: 2 }, 'projection-unavailable'],
      [{ feed_end_date: '2026-10-25' }, 'projection-metadata-mismatch'],
    ] as const) {
      await db()
        .update(projections)
        .set(patch)
        .where(eq(projections.id, next.id));
      const result = await select('2026-10-24', uncovered);
      expect(result.attempts.map(({ reason }) => reason)).toEqual([
        reason,
        'eligible',
      ]);
      expect(result.selected?.version.manifestSha256).toBe(
        bundle.entry.manifestSha256,
      );
      await db()
        .update(projections)
        .set({
          completed_at: selected.selected?.completedAt,
          topology_sha256: selected.selected?.topology.sha256,
          topology_projection_version: 1,
          projector_version: 1,
          feed_end_date: '2026-10-24',
        })
        .where(eq(projections.id, next.id));
    }
    await db()
      .update(days)
      .set({ unassigned_active_trip_count: 1 })
      .where(eq(days.projection_id, next.id));
    expect(
      (await select('2026-10-24', uncovered)).attempts.map(
        ({ reason }) => reason,
      ),
    ).toEqual(['mapping-coverage-gap', 'eligible']);
    await db().delete(days).where(eq(days.projection_id, next.id));
    expect(
      (await select('2026-10-24', uncovered)).attempts.map(
        ({ reason }) => reason,
      ),
    ).toEqual(['day-not-indexed', 'eligible']);
    await db().delete(days);
    expect((await select('2026-10-25')).selected).toBeNull();
  });

  it('fails closed on corrupt retained lineage even when a complete projection exists', async () => {
    await projectScheduledTimetable(db(), options());
    const [retained] = await db()
      .select({ receipt: timetables.import_record })
      .from(timetables);
    const receipt = structuredClone(retained.receipt) as {
      sourceReview: { successor: { snapshotSha256: string } };
    };
    receipt.sourceReview.successor.snapshotSha256 = 'f'.repeat(64);
    await db().update(timetables).set({ import_record: receipt });
    await expect(select()).rejects.toThrow(
      'Invalid retained timetable source review',
    );
  });

  it('keeps canonical, selection and subsequent reads on one snapshot across concurrent canonical change and projection invalidation', async () => {
    const projection = await projectScheduledTimetable(db(), options());
    await pool.query(
      'CREATE TABLE selector_canonical (topology json NOT NULL)',
    );
    try {
      await pool.query('INSERT INTO selector_canonical VALUES ($1)', [
        JSON.stringify(canonical.topology()),
      ]);
      const readCanonicalTopology = async (
        tx: Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0],
      ) => {
        const result = await tx.execute<{
          topology: ReturnType<typeof canonical.topology>;
        }>(sql`SELECT topology FROM selector_canonical`);
        return result.rows[0].topology;
      };
      await withSelectedScheduledTimetable(
        db(),
        {
          serviceDate: '2026-10-24',
          scope,
          readCanonicalTopology: async (tx) => {
            const topology = await readCanonicalTopology(tx);
            await db().transaction(async (writer) => {
              await writer.execute(
                sql`UPDATE selector_canonical SET topology = ${JSON.stringify({ ...canonical.topology(), projectionVersion: 2 })}::json`,
              );
              await writer
                .update(projections)
                .set({ completed_at: null })
                .where(eq(projections.id, projection.id));
              await writer
                .delete(days)
                .where(eq(days.projection_id, projection.id));
            });
            return topology;
          },
        },
        async (tx, selection) => {
          expect(selection.selected?.projectionId).toBe(projection.id);
          expect((await readCanonicalTopology(tx)).projectionVersion).toBe(1);
          expect(await tx.select().from(days)).toHaveLength(3);
        },
      );
      const after = await withSelectedScheduledTimetable(
        db(),
        {
          serviceDate: '2026-10-24',
          scope,
          readCanonicalTopology,
        },
        async (_tx, selection) => selection,
      );
      expect(after.selected).toBeNull();
      expect(after.attempts[0].reason).toBe('topology-mismatch');
      expect(await db().select().from(days)).toHaveLength(0);
    } finally {
      await pool.query('DROP TABLE selector_canonical');
    }
  });

  it('projects overnight and untimed occurrences, explicit coverage, source counts and safe replay', async () => {
    const [projection, concurrent] = await Promise.all([
      projectScheduledTimetable(db(), options()),
      projectScheduledTimetable(db(), options()),
    ]);
    expect(concurrent).toEqual(projection);
    const [metadata] = await db().select().from(projections);
    expect(metadata).toMatchObject({
      ...projection,
      maximum_departure_seconds: 100_000,
      feed_start_date: '2026-10-24',
      feed_end_date: '2026-10-26',
      topology_projection_version: 1,
      topology_sha256: hashBytes(
        Buffer.from(JSON.stringify(canonical.topology())),
      ),
    });
    expect(metadata.completed_at).not.toBeNull();
    const dateRows = await db().select().from(days).orderBy(days.service_date);
    expect(
      dateRows.map((day) => [
        day.service_date,
        day.active_trip_count,
        day.unassigned_active_trip_count,
      ]),
    ).toEqual([
      ['2026-10-24', 251, 0],
      ['2026-10-25', 0, 0],
      ['2026-10-26', 252, 1],
    ]);
    const coverage = await db()
      .select()
      .from(scopes)
      .where(eq(scopes.station_id, 'station-1'));
    expect(coverage).toHaveLength(3);
    expect(
      coverage.every(
        (row) => row.platform_ids.join() === 'alternative,platform-1',
      ),
    ).toBe(true);
    const rows = await storedOccurrences();
    expect(rows).toHaveLength(1004);
    expect(
      rows.find(
        (row) => row.provider_trip_id === 'trip' && row.occurrence_index === 0,
      ),
    ).toMatchObject({
      service_date: '2026-10-24',
      stop_sequence: '00001',
      departure_seconds: 90_000,
      departure_instant: '2026-10-24 17:00:00+00',
      timepoint: 1,
    });
    expect(rows.find((row) => row.occurrence_index === 1)).toMatchObject({
      stop_sequence: '09007199254740993123',
      departure_seconds: null,
      departure_instant: null,
    });
    const empty = await selectRetainedScheduledTimetable({
      ...shared(),
      serviceDate: '2026-10-25',
    });
    expect(empty.attempts.at(-1)).toMatchObject({
      reason: 'eligible',
      activeTripCount: 0,
    });
    const gap = await selectRetainedScheduledTimetable({
      ...shared(),
      serviceDate: '2026-10-26',
    });
    expect(gap.attempts.at(-1)).toMatchObject({
      reason: 'mapping-coverage-gap',
      activeTripCount: 252,
      unassignedActiveTripCount: 1,
    });
    const sharedRows = await queryRetainedScheduledDepartures({
      ...shared(),
      scope: { ...scope, stationId: 'station-2', platformId: undefined },
      startInstant: '2026-10-24T16:00:00Z',
      endInstant: '2026-10-24T18:00:00Z',
    });
    expect(sharedRows).toMatchObject({
      departures: [],
      untimedDepartureCount: 251,
    });
    expect(await projectScheduledTimetable(db(), options())).toEqual(
      projection,
    );
    expect(await storedOccurrences()).toEqual(rows);
  });

  it('hides failed rebuilds, rejects damaged bytes/topology, and serializes concurrent retries', async () => {
    const projection = await projectScheduledTimetable(db(), options());
    const [metadata] = await db().select().from(projections);
    const { id: _id, ...previous } = metadata;
    const originalRows = await storedOccurrences();
    const [older] = await db()
      .insert(projections)
      .values({ ...previous, projector_version: 2 })
      .returning();
    await pool.query(
      `CREATE FUNCTION fail_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.service_date = '2026-10-26' AND NEW.provider_trip_id = 'trip' THEN RAISE EXCEPTION 'synthetic late batch failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_projection BEFORE INSERT ON scheduled_departure_occurrences FOR EACH ROW EXECUTE FUNCTION fail_projection()`,
    );
    await expect(projectScheduledTimetable(db(), options())).rejects.toThrow(
      'Failed query',
    );
    expect((await storedProjection(projection.id)).completed_at).toBeNull();
    expect(await storedOccurrences()).toEqual(originalRows);
    await pool.query(
      'DROP TRIGGER fail_projection ON scheduled_departure_occurrences',
    );
    await db()
      .update(timetables)
      .set({ notice_bytes: Buffer.from('damaged') });
    await expect(projectScheduledTimetable(db(), options())).rejects.toThrow(
      'notice',
    );
    await db()
      .update(timetables)
      .set({ notice_bytes: Buffer.from(bundle.files['NOTICE.txt']) });
    const stationFile = join(directory, 'data/station/station-1.json');
    const stationBytes = await readFile(stationFile);
    const station = JSON.parse(stationBytes.toString());
    station.layout.platforms[0].label = 'changed';
    await writeFile(stationFile, JSON.stringify(station));
    await expect(projectScheduledTimetable(db(), options())).rejects.toThrow(
      'topology fingerprint',
    );
    await writeFile(stationFile, stationBytes);
    await db().delete(days).where(eq(days.projection_id, projection.id));
    await db()
      .update(projections)
      .set({ completed_at: metadata.completed_at })
      .where(eq(projections.id, projection.id));
    const results = await Promise.all([
      projectScheduledTimetable(db(), options()),
      projectScheduledTimetable(db(), options()),
    ]);
    expect(results).toEqual([projection, projection]);
    expect(await db().select().from(occurrences)).toHaveLength(1004);
    expect((await storedProjection(projection.id)).completed_at).not.toBeNull();
    expect(await storedProjection(older.id)).toEqual(older);
  });
});
