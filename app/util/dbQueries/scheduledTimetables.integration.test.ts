import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_TIMETABLE_DATABASE_URL;
const schema = `gtfs_test_${randomUUID().replaceAll('-', '')}`;

describe.skipIf(!url)('scheduled timetable migration', () => {
  let admin: Pool;
  let pool: Pool;
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
    });
    await pool.query(
      await readFile(
        new URL(
          '../../../drizzle/20261024214325_superb_violations/migration.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
  async function insert(
    hash: string,
    predecessor: string | null,
    receiptHash: string | null = hash,
  ) {
    return pool.query(
      `
      INSERT INTO scheduled_timetables (
        manifest_sha256, predecessor_sha256, import_record, pages_entry,
        manifest_bytes, timetable_bytes, notice_bytes, release_bytes,
        mapping_draft_bytes, mapping_approval_bytes, release_review_bytes
      ) VALUES ($1, $2, $3, $4, $5, $5, $5, $5, $5, $5, $5)
    `,
      [
        hash,
        predecessor,
        { manifestSha256: receiptHash, predecessorSha256: predecessor },
        {},
        Buffer.from('synthetic storage bytes'),
      ],
    );
  }

  it('preserves bundle bytes and enforces a single baseline, one successor and valid receipt links', async () => {
    const baseline = 'a'.repeat(64);
    const successor = 'b'.repeat(64);
    const rejected = 'c'.repeat(64);
    await insert(baseline, null);
    await expect(insert(rejected, null)).rejects.toMatchObject({
      code: '23505',
    });
    await insert(successor, baseline);
    await expect(insert(rejected, baseline)).rejects.toMatchObject({
      code: '23505',
    });
    await expect(insert(rejected, 'f'.repeat(64))).rejects.toMatchObject({
      code: '23503',
    });
    await expect(
      insert(rejected, successor, 'd'.repeat(64)),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(insert(rejected, successor, null)).rejects.toMatchObject({
      code: '23514',
    });
    const { rows } = await pool.query(
      'SELECT * FROM scheduled_timetables ORDER BY manifest_sha256',
    );
    expect(rows.map((row) => row.manifest_sha256)).toEqual([
      baseline,
      successor,
    ]);
    for (const row of rows) {
      for (const field of [
        'manifest_bytes',
        'timetable_bytes',
        'notice_bytes',
        'release_bytes',
        'mapping_draft_bytes',
        'mapping_approval_bytes',
        'release_review_bytes',
      ]) {
        expect(row[field]).toEqual(Buffer.from('synthetic storage bytes'));
      }
    }
  });
});
