import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { relations } from '~/db/relations';
import { retainScheduledTimetable } from './retainScheduledTimetable';
import {
  retentionBundle,
  retentionReview,
} from './scheduledTimetableRetention.fixture';

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

  describe('append-only retention', () => {
    const a = retentionBundle();
    const b = retentionBundle('b');
    const c = retentionBundle('c');
    const instant = '2026-10-24T00:02:00Z';
    function retain(
      bundle: ReturnType<typeof retentionBundle>,
      sourceReview?: ReturnType<typeof retentionReview>,
      importInstant = instant,
    ) {
      return retainScheduledTimetable(
        drizzle({ client: pool, relations }),
        bundle,
        { sourceReview, importInstant },
      );
    }
    beforeEach(async () => {
      // Recreate only this test's isolated table, including after corruption cases.
      await pool.query('DROP TABLE scheduled_timetables');
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

    it('requires baseline review and preserves all seven bytes and the first receipt on retries', async () => {
      expect(await retain(a)).toMatchObject({
        status: 'blocked',
        blockers: ['source-review-required'],
      });
      const first = await retain(a, retentionReview(a));
      expect(first.status).toBe('retained');
      const before = (await pool.query('SELECT * FROM scheduled_timetables'))
        .rows;
      // Even alternate caller-supplied companion bytes/review cannot rewrite a receipt.
      const retry = {
        ...a,
        files: { ...a.files, 'release-review.json': Buffer.from('retry') },
      };
      expect(
        await retain(
          retry,
          { ...retentionReview(a), reason: 'later review' },
          '2026-10-24T00:03:00Z',
        ),
      ).toMatchObject({ status: 'already-retained', record: first.record });
      expect(
        (await pool.query('SELECT * FROM scheduled_timetables')).rows,
      ).toEqual(before);
      const columns = [
        'manifest_bytes',
        'timetable_bytes',
        'notice_bytes',
        'release_bytes',
        'mapping_draft_bytes',
        'mapping_approval_bytes',
        'release_review_bytes',
      ];
      Object.values(a.files).forEach((bytes, index) =>
        expect(before[0][columns[index]]).toEqual(Buffer.from(bytes)),
      );
      const tampered = {
        ...b,
        files: { ...b.files, 'timetable.json': Buffer.from('changed') },
      };
      await expect(retain(tampered, retentionReview(b, a))).rejects.toThrow(
        'SHA-256',
      );
    });

    it('requires exact reviewed links, increasing corrections and monotonic import clocks, while treating provider versions as opaque', async () => {
      await retain(a, retentionReview(a));
      expect(await retain(b)).toMatchObject({
        status: 'blocked',
        blockers: ['source-review-required'],
      });
      expect(await retain(b, retentionReview(b, c))).toMatchObject({
        status: 'blocked',
        blockers: ['source-review-mismatch'],
      });
      expect(await retain(b, retentionReview(c, a))).toMatchObject({
        status: 'blocked',
        blockers: ['source-review-mismatch'],
      });
      expect(
        await retain(b, retentionReview(b, a), '2026-10-24T00:01:30Z'),
      ).toMatchObject({
        status: 'blocked',
        blockers: ['import-time-precedes-predecessor'],
      });
      const correction = retentionBundle('a', 2);
      expect(
        await retain(correction, retentionReview(correction, a, 'correction')),
      ).toMatchObject({ status: 'retained' });
      const lowerRevision = retentionBundle('a', 1);
      // Distinct manifest, same source and revision 1, after a revision 2 correction.
      const manifest = JSON.parse(
        Buffer.from(lowerRevision.files['manifest.json']).toString(),
      );
      manifest.mapping.version = 'another mapping';
      lowerRevision.files['manifest.json'] = Buffer.from(
        JSON.stringify(manifest),
      );
      const { createHash } = await import('node:crypto');
      lowerRevision.entry.manifestSha256 = createHash('sha256')
        .update(lowerRevision.files['manifest.json'])
        .digest('hex');
      expect(
        await retain(
          lowerRevision,
          retentionReview(lowerRevision, correction, 'correction'),
        ),
      ).toMatchObject({
        status: 'blocked',
        blockers: ['correction-revision-not-increased'],
      });
      // zzz -> aaa is admitted by exact review; version strings do not order sources.
      expect(await retain(b, retentionReview(b, correction))).toMatchObject({
        status: 'retained',
      });
      const backtrack = retentionBundle('a', 3);
      expect(
        await retain(backtrack, retentionReview(backtrack, b)),
      ).toMatchObject({
        status: 'blocked',
        blockers: ['older-source-already-retained'],
      });
      expect(
        (await pool.query('SELECT count(*) FROM scheduled_timetables')).rows[0]
          .count,
      ).toBe('3');
      // Replaying an old retained version does not move the head.
      expect(await retain(a)).toMatchObject({ status: 'already-retained' });
      expect(await retain(c)).toMatchObject({
        status: 'blocked',
        blockers: ['provider-version-conflict'],
      });
      expect(await retain(c, retentionReview(c, b))).toMatchObject({
        status: 'blocked',
        blockers: ['source-review-mismatch'],
      });
      expect(
        await retain(c, retentionReview(c, b, 'resolve-version-conflict')),
      ).toMatchObject({ status: 'retained' });
    });

    it('serializes duplicate retries and competing successors using independent pooled connections', async () => {
      const baseline = await Promise.all([
        retain(a, retentionReview(a)),
        retain(a, retentionReview(a)),
      ]);
      expect(baseline.map((result) => result.status).sort()).toEqual([
        'already-retained',
        'retained',
      ]);
      const successors = await Promise.all([
        retain(b, retentionReview(b, a)),
        retain(c, retentionReview(c, a)),
      ]);
      expect(successors.map((result) => result.status).sort()).toEqual([
        'blocked',
        'retained',
      ]);
      expect(
        successors.find((result) => result.status === 'blocked')?.blockers,
      ).toContain('source-review-mismatch');
      expect(
        (await pool.query('SELECT count(*) FROM scheduled_timetables')).rows[0]
          .count,
      ).toBe('2');
    });

    it.each([
      'fork',
      'missing predecessor',
      'cycle',
      'time reversal',
      'review mismatch',
      'old source',
      'manifest digest',
    ])('rejects retained lineage corruption: %s', async (damage) => {
      await retain(a, retentionReview(a));
      await retain(b, retentionReview(b, a));
      await retain(c, retentionReview(c, b, 'resolve-version-conflict'));
      let hash = c.entry.manifestSha256;
      if (
        damage === 'fork' ||
        damage === 'missing predecessor' ||
        damage === 'cycle'
      ) {
        await pool.query(
          'ALTER TABLE scheduled_timetables DROP CONSTRAINT scheduled_timetables_predecessor_unique',
        );
        await pool.query(
          'ALTER TABLE scheduled_timetables DROP CONSTRAINT "scheduled_timetables_sR3hQvgZpBSd_fkey"',
        );
        if (damage === 'cycle') {
          hash = a.entry.manifestSha256;
        }
        const predecessor =
          damage === 'fork'
            ? a.entry.manifestSha256
            : damage === 'cycle'
              ? c.entry.manifestSha256
              : 'f'.repeat(64);
        await pool.query(
          "UPDATE scheduled_timetables SET predecessor_sha256 = $1, import_record = jsonb_set(import_record, '{predecessorSha256}', to_jsonb($1::text)) WHERE manifest_sha256 = $2",
          [predecessor, hash],
        );
      } else if (damage === 'time reversal') {
        await pool.query(
          "UPDATE scheduled_timetables SET import_record = jsonb_set(import_record, '{importInstant}', '\"2026-10-24T00:01:30Z\"') WHERE manifest_sha256 = $1",
          [hash],
        );
      } else if (damage === 'review mismatch') {
        await pool.query(
          "UPDATE scheduled_timetables SET import_record = jsonb_set(import_record, '{sourceReview,predecessor,manifestSha256}', to_jsonb($1::text)) WHERE manifest_sha256 = $2",
          [a.entry.manifestSha256, hash],
        );
      } else if (damage === 'old source') {
        const old = retentionBundle('a', 2);
        await pool.query(
          "UPDATE scheduled_timetables SET manifest_sha256 = $1, manifest_bytes = $2, import_record = jsonb_set(jsonb_set(import_record, '{manifestSha256}', to_jsonb($1::text)), '{sourceReview}', $3::jsonb) WHERE manifest_sha256 = $4",
          [
            old.entry.manifestSha256,
            old.files['manifest.json'],
            JSON.stringify(retentionReview(old, b)),
            hash,
          ],
        );
      } else {
        await pool.query(
          "UPDATE scheduled_timetables SET manifest_bytes = manifest_bytes || '\\x20'::bytea WHERE manifest_sha256 = $1",
          [hash],
        );
      }
      const before = (
        await pool.query(
          'SELECT * FROM scheduled_timetables ORDER BY manifest_sha256',
        )
      ).rows;
      // Even an idempotent retry checks the entire lineage before returning.
      await expect(retain(a)).rejects.toThrow(/Retained|Invalid retained/);
      expect(
        (
          await pool.query(
            'SELECT * FROM scheduled_timetables ORDER BY manifest_sha256',
          )
        ).rows,
      ).toEqual(before);
    });
  });
});
