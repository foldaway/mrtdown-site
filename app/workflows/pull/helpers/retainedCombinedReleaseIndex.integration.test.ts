import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { relations } from '~/db/relations';
import { retainCombinedTimetable } from '~/util/dbQueries/retainScheduledTimetable';
import { retentionReview } from '~/util/dbQueries/scheduledTimetableRetention.fixture';
import { combinedTimetableArchiveFixture } from './combinedTimetableArchive.fixture';
import { scheduledTimetableArchiveFixture } from './scheduledTimetableArchive.fixture';
import { retainedCombinedReleaseIndex } from './retainedCombinedReleaseIndex';

const url = process.env.TEST_TIMETABLE_DATABASE_URL;
const schema = `gtfs_retained_index_test_${randomUUID().replaceAll('-', '')}`;

describe.skipIf(!url)('retained combined release index', () => {
  let admin: Pool;
  let pool: Pool;
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
      '20261108020149_combined_timetable_retention',
    ]) {
      await pool.query(
        await readFile(
          new URL(
            `../../../../drizzle/${migration}/migration.sql`,
            import.meta.url,
          ),
          'utf8',
        ),
      );
    }
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it('uses only the validated admitted receipt for an empty replay', async () => {
    const db = drizzle({ client: pool, relations });
    expect(await retainedCombinedReleaseIndex(db)).toBeUndefined();
    const combined = combinedTimetableArchiveFixture();
    const review = {
      ...retentionReview(scheduledTimetableArchiveFixture('a')),
      successor: {
        manifestSha256: combined.index.manifestSha256,
        snapshotSha256: combined.capture.sha256,
      },
      reviewedAt: '2026-11-03T00:00:00Z',
    };
    const retained = await retainCombinedTimetable(
      db,
      combined.index,
      {
        manifestBytes: combined.files.manifestBytes,
        timetableBytes: combined.files.timetableBytes,
        releaseBytes: combined.files.releaseBytes,
      },
      combined.topology,
      { importInstant: '2026-11-03T00:01:00Z', sourceReview: review },
    );
    expect(retained.status).toBe('retained');
    expect(await retainedCombinedReleaseIndex(db)).toEqual(combined.index);
    await pool.query('UPDATE scheduled_timetables SET manifest_bytes = $1', [
      Buffer.from('{}'),
    ]);
    await expect(retainedCombinedReleaseIndex(db)).rejects.toThrow(
      'Retained timetable manifest does not match its row',
    );
  });
});
