import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ScheduledTimetableArtifactManifestSchema } from '@mrtdown/core';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { retainScheduledTimetable } from '~/util/dbQueries/retainScheduledTimetable';
import {
  retentionBundle,
  retentionReview,
} from '~/util/dbQueries/scheduledTimetableRetention.fixture';
import { relations } from './relations';
import {
  scheduledDepartureDaysTable as days,
  scheduledDepartureOccurrencesTable as occurrences,
  scheduledDepartureProjectionsTable as projections,
  scheduledDepartureScopesTable as scopes,
} from './scheduledDepartures.schema';

const url = process.env.TEST_TIMETABLE_DATABASE_URL;
const schema = `gtfs_departures_test_${randomUUID().replaceAll('-', '')}`;

// PostgreSQL SQLSTATE codes below: 23505 unique, 23503 foreign key, 23514 check.
describe.skipIf(!url)('scheduled departure storage', () => {
  let admin: Pool;
  let pool: Pool;
  let db: ReturnType<typeof database>;
  const baseline = retentionBundle();
  const successor = retentionBundle('b');

  function database() {
    return drizzle({ client: pool, relations });
  }

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
          new URL(`../../drizzle/${migration}/migration.sql`, import.meta.url),
          'utf8',
        ),
      );
    }
    db = database();
    await retainScheduledTimetable(db, baseline, {
      sourceReview: retentionReview(baseline),
      importInstant: '2026-10-24T00:02:00Z',
    });
    await retainScheduledTimetable(db, successor, {
      sourceReview: retentionReview(successor, baseline),
      importInstant: '2026-10-24T00:03:00Z',
    });
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE scheduled_departure_projections CASCADE');
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  async function createProjection(bundle = baseline, projectorVersion = 1) {
    const manifest = ScheduledTimetableArtifactManifestSchema.parse(
      JSON.parse(Buffer.from(bundle.files['manifest.json']).toString()),
    );
    const [row] = await db
      .insert(projections)
      .values({
        manifest_sha256: bundle.entry.manifestSha256,
        projector_version: projectorVersion,
        topology_sha256: manifest.identity.topology.sha256,
        topology_projection_version:
          manifest.identity.topology.projectionVersion,
        feed_start_date: manifest.feedRange.startDate,
        feed_end_date: manifest.feedRange.endDate,
        maximum_departure_seconds: 90_000,
      })
      .returning();
    return row;
  }

  function dayCoverage(projectionId: number) {
    return {
      projection_id: projectionId,
      service_date: '2026-10-24',
      active_trip_count: 1,
      unassigned_active_trip_count: 0,
    };
  }

  function scopeCoverage(projectionId: number) {
    return {
      projection_id: projectionId,
      service_date: '2026-10-24',
      station_id: 'station',
      line_id: 'line',
      service_id: 'service',
      destination_station_id: 'destination',
      platform_ids: ['platform-1', 'platform-2'],
    };
  }

  function boardableOccurrence(projectionId: number) {
    return {
      ...scopeCoverage(projectionId),
      provider_trip_id: '000-trip',
      provider_route_id: '000-route',
      provider_calendar_id: '000-calendar',
      provider_stop_id: '000-stop',
      stop_sequence: '09007199254740993123',
      occurrence_index: 1,
      revision_id: '000-revision',
      arrival_seconds: 89_940,
      departure_seconds: 90_000,
      arrival_instant: '2026-10-25T00:59:00+08:00',
      departure_instant: '2026-10-25T01:00:00+08:00',
      pickup_type: 0 as const,
      drop_off_type: 0 as const,
      timepoint: 0 as const,
    };
  }

  it('keeps versions and provenance distinct and deletes derived rows without deleting retained bundles', async () => {
    const first = await createProjection();
    await expect(createProjection()).rejects.toMatchObject({
      cause: { code: '23505' },
    });
    const rebuilt = await createProjection(baseline, 2);
    const next = await createProjection(successor);
    await expect(
      db
        .update(projections)
        .set({ manifest_sha256: 'f'.repeat(64) })
        .where(eq(projections.id, next.id)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    for (const row of [first, rebuilt, next]) {
      await db.insert(days).values(dayCoverage(row.id));
      await db.insert(scopes).values(scopeCoverage(row.id));
      await db.insert(occurrences).values(boardableOccurrence(row.id));
    }
    await expect(
      db.insert(occurrences).values(boardableOccurrence(first.id)),
    ).rejects.toMatchObject({
      cause: { code: '23505' },
    });
    await expect(
      pool.query(
        'DELETE FROM scheduled_timetables WHERE manifest_sha256 = $1',
        [successor.entry.manifestSha256],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await db.delete(projections).where(eq(projections.id, first.id));
    expect(
      (await db.select().from(occurrences))
        .map((row) => row.projection_id)
        .sort(),
    ).toEqual([rebuilt.id, next.id].sort());
    expect(
      (await pool.query('SELECT count(*) FROM scheduled_timetables')).rows[0]
        .count,
    ).toBe('2');
  });

  it('requires explicit day/scope coverage and keeps incomplete builds separate from completed empty coverage', async () => {
    const empty = await createProjection();
    expect(empty.completed_at).toBeNull();
    await expect(
      db.insert(scopes).values(scopeCoverage(empty.id)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await db
      .insert(days)
      .values({ ...dayCoverage(empty.id), active_trip_count: 0 });
    await expect(
      db.insert(occurrences).values(boardableOccurrence(empty.id)),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await db.insert(scopes).values(scopeCoverage(empty.id));
    await expect(
      db.insert(occurrences).values({
        ...boardableOccurrence(empty.id),
        destination_station_id: 'other',
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    expect(await db.select().from(occurrences)).toEqual([]);
    await db
      .update(projections)
      .set({ completed_at: '2026-10-25T00:00:00Z' })
      .where(eq(projections.id, empty.id));
    const gap = await createProjection(successor);
    await db.insert(days).values({
      ...dayCoverage(gap.id),
      active_trip_count: 5,
      unassigned_active_trip_count: 1,
    });
    expect(
      (await db.select().from(days).where(eq(days.projection_id, gap.id)))[0],
    ).toMatchObject({ active_trip_count: 5, unassigned_active_trip_count: 1 });
    const [completedEmpty] = await db
      .select()
      .from(projections)
      .where(eq(projections.id, empty.id));
    expect(completedEmpty.completed_at).not.toBeNull();
    expect(gap.completed_at).toBeNull();
  });

  it('preserves overnight dates, opaque occurrence identity, approximate and untimed candidates', async () => {
    const row = await createProjection();
    await db.insert(days).values(dayCoverage(row.id));
    await db.insert(scopes).values(scopeCoverage(row.id));
    await db.insert(occurrences).values(boardableOccurrence(row.id));
    const untimed = {
      ...boardableOccurrence(row.id),
      stop_sequence: '09007199254740993124',
      occurrence_index: 2,
      arrival_seconds: null,
      departure_seconds: null,
      arrival_instant: null,
      departure_instant: null,
    };
    await db.insert(occurrences).values(untimed);
    const stored = await db
      .select()
      .from(occurrences)
      .orderBy(occurrences.occurrence_index);
    expect(stored[0]).toMatchObject({
      service_date: '2026-10-24',
      departure_seconds: 90_000,
      provider_trip_id: '000-trip',
      stop_sequence: '09007199254740993123',
      timepoint: 0,
    });
    expect(new Date(stored[0].departure_instant ?? '').toISOString()).toBe(
      '2026-10-24T17:00:00.000Z',
    );
    expect(stored[1]).toMatchObject({
      departure_seconds: null,
      departure_instant: null,
    });
    await expect(
      db.insert(occurrences).values({
        ...untimed,
        stop_sequence: '99999999999999999999',
        timepoint: 1,
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(
      db.insert(occurrences).values({
        ...untimed,
        stop_sequence: '99999999999999999999',
        pickup_type: 1,
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });
});
