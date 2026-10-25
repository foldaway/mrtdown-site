import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { expect, it } from 'vitest';
import {
  scheduledDepartureDaysTable as days,
  scheduledDepartureOccurrencesTable as occurrences,
  scheduledDepartureProjectionsTable as projections,
  scheduledDepartureScopesTable as scopes,
} from './scheduledDepartures.schema';
import { scheduledTimetablesTable as timetables } from './scheduledTimetables.schema';

const url = process.env.TEST_TIMETABLE_DATABASE_URL;

it.skipIf(!url)(
  'migrates scheduled departure storage with versioned provenance and safe deletion',
  async () => {
    const schema = `gtfs_departures_test_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool({ connectionString: url });
    const pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
    });
    const db = drizzle({ client: pool });

    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      for (const migration of [
        '20261024214325_superb_violations',
        '20261025200054_violet_energizer',
      ]) {
        await pool.query(
          await readFile(
            new URL(
              `../../drizzle/${migration}/migration.sql`,
              import.meta.url,
            ),
            'utf8',
          ),
        );
      }

      // Synthetic archive bytes keep this focused on storage, without repeating retention tests.
      const manifest = 'a'.repeat(64);
      const bytes = Buffer.from('synthetic retained bytes');
      await db.insert(timetables).values({
        manifest_sha256: manifest,
        import_record: { manifestSha256: manifest, predecessorSha256: null },
        pages_entry: {},
        manifest_bytes: bytes,
        timetable_bytes: bytes,
        notice_bytes: bytes,
        release_bytes: bytes,
        mapping_draft_bytes: bytes,
        mapping_approval_bytes: bytes,
        release_review_bytes: bytes,
      });
      const projection = {
        manifest_sha256: manifest,
        projector_version: 1,
        topology_sha256: 'b'.repeat(64),
        topology_projection_version: 1,
        feed_start_date: '2026-10-24',
        feed_end_date: '2026-10-24',
        maximum_departure_seconds: 90_000,
      };
      const [original] = await db
        .insert(projections)
        .values(projection)
        .returning();
      expect(original.completed_at).toBeNull();
      await expect(
        db.insert(projections).values(projection),
      ).rejects.toMatchObject({
        cause: { code: '23505' }, // unique violation
      });
      await expect(
        db
          .insert(projections)
          .values({ ...projection, manifest_sha256: 'f'.repeat(64) }),
      ).rejects.toMatchObject({
        cause: { code: '23503' }, // foreign key violation
      });
      const [rebuilt] = await db
        .insert(projections)
        .values({ ...projection, projector_version: 2 })
        .returning();

      const scope = {
        projection_id: original.id,
        service_date: '2026-10-24',
        station_id: 'station',
        line_id: 'line',
        service_id: 'service',
        destination_station_id: 'destination',
        platform_ids: ['platform'],
      };
      await expect(db.insert(scopes).values(scope)).rejects.toMatchObject({
        cause: { code: '23503' },
      });
      await db.insert(days).values({
        projection_id: original.id,
        service_date: scope.service_date,
        active_trip_count: 1,
        unassigned_active_trip_count: 0,
      });
      await db.insert(scopes).values(scope);
      const occurrence = {
        ...scope,
        provider_trip_id: '000-trip',
        provider_route_id: '000-route',
        provider_calendar_id: '000-calendar',
        provider_stop_id: '000-stop',
        stop_sequence: '09007199254740993123',
        occurrence_index: 1,
        revision_id: 'revision',
        arrival_seconds: 89_940,
        departure_seconds: 90_000,
        arrival_instant: '2026-10-25T00:59:00+08:00',
        departure_instant: '2026-10-25T01:00:00+08:00',
        pickup_type: 0 as const,
        drop_off_type: 0 as const,
        timepoint: 0 as const,
      };
      await db.insert(occurrences).values(occurrence);
      await expect(
        db.insert(occurrences).values(occurrence),
      ).rejects.toMatchObject({ cause: { code: '23505' } });
      await expect(
        db.insert(occurrences).values({
          ...occurrence,
          provider_trip_id: 'uncovered-trip',
          destination_station_id: 'other',
        }),
      ).rejects.toMatchObject({ cause: { code: '23503' } });

      await expect(
        db.delete(timetables).where(eq(timetables.manifest_sha256, manifest)),
      ).rejects.toMatchObject({ cause: { code: '23503' } });
      await db.delete(projections).where(eq(projections.id, original.id));
      expect(await db.select().from(occurrences)).toEqual([]);
      expect(await db.select({ id: projections.id }).from(projections)).toEqual(
        [{ id: rebuilt.id }],
      );
      expect(
        await db
          .select({ manifest: timetables.manifest_sha256 })
          .from(timetables),
      ).toEqual([{ manifest }]);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  },
);
