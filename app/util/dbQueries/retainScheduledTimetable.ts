import {
  assessScheduledTimetableSourceChange,
  type ScheduledTimetablePagesEntry,
  ScheduledTimetablePagesEntrySchema,
  type ScheduledTimetableSourceReview,
  ScheduledTimetableSourceReviewSchema,
} from '@mrtdown/core';
import {
  ScheduledTimetableImportRecordSchema,
  verifyScheduledTimetableArtifact,
} from '@mrtdown/fs';
import { sql } from 'drizzle-orm';
import type { getDb } from '~/db';
import { scheduledTimetablesTable } from '~/db/scheduledTimetables.schema';
import { validateScheduledTimetableHistory } from './scheduledTimetableHistory';

/**
 * All seven files passed artifact and release/mapping binding verification
 * against an independently trusted Pages entry. This is retention input, not
 * serving eligibility: source-order review and canonical compatibility are
 * separate. Preserve the original bytes, including the parsed review records.
 */
export type VerifiedScheduledTimetableBundle = {
  entry: ScheduledTimetablePagesEntry;
  files: Record<
    | 'manifest.json'
    | 'timetable.json'
    | 'NOTICE.txt'
    | 'release.json'
    | 'mapping-draft.json'
    | 'mapping-approval.json'
    | 'release-review.json',
    Uint8Array
  >;
};

type RetentionOptions = {
  importInstant: string;
  sourceReview?: ScheduledTimetableSourceReview;
};

/**
 * Trusted internal input only: callers authenticate the Pages entry and verify
 * all seven bundle files before calling. Review and clock come from the caller,
 * never from an untrusted archive. Artifact bytes are defensively rechecked here.
 * Retention admits source order only; it grants no release/mapping approval or
 * canonical compatibility and must not be used as a serving eligibility check.
 */
export async function retainScheduledTimetable(
  db: ReturnType<typeof getDb>,
  bundle: VerifiedScheduledTimetableBundle,
  options: RetentionOptions,
) {
  const entry = ScheduledTimetablePagesEntrySchema.parse(bundle.entry);
  const sourceReview = options.sourceReview
    ? ScheduledTimetableSourceReviewSchema.parse(options.sourceReview)
    : undefined;
  const importInstant = options.importInstant;
  // Own the buffers across transaction waits so caller mutation cannot change
  // the bytes after validation or while waiting for the predecessor lock.
  const files = {
    manifest_bytes: Buffer.from(bundle.files['manifest.json']),
    timetable_bytes: Buffer.from(bundle.files['timetable.json']),
    notice_bytes: Buffer.from(bundle.files['NOTICE.txt']),
    release_bytes: Buffer.from(bundle.files['release.json']),
    mapping_draft_bytes: Buffer.from(bundle.files['mapping-draft.json']),
    mapping_approval_bytes: Buffer.from(bundle.files['mapping-approval.json']),
    release_review_bytes: Buffer.from(bundle.files['release-review.json']),
  };
  const hash = entry.manifestSha256;
  const { manifest } = verifyScheduledTimetableArtifact(
    files.manifest_bytes,
    hash,
    { timetableBytes: files.timetable_bytes, noticeBytes: files.notice_bytes },
  );

  return db.transaction(
    async (tx) => {
      // Table lock also serializes ordinary SQL writers, not just helper callers.
      // Acquire before reading: a waiting worker must see the committed successor.
      await tx.execute(sql`LOCK TABLE scheduled_timetables IN EXCLUSIVE MODE`);
      const rows = await tx
        .select({
          hash: scheduledTimetablesTable.manifest_sha256,
          predecessor: scheduledTimetablesTable.predecessor_sha256,
          receipt: scheduledTimetablesTable.import_record,
          manifestBytes: scheduledTimetablesTable.manifest_bytes,
        })
        .from(scheduledTimetablesTable);
      const history = await validateScheduledTimetableHistory(rows);
      const retained = history.find(
        (version) => version.manifestSha256 === hash,
      );
      if (retained) {
        return { status: 'already-retained' as const, record: retained.record };
      }
      const predecessor = history.at(-1);
      const assessment = assessScheduledTimetableSourceChange({
        candidate: { manifestSha256: hash, manifest },
        incumbent: predecessor
          ? {
              manifestSha256: predecessor.manifestSha256,
              manifest: predecessor.manifest,
            }
          : undefined,
        review: sourceReview,
        importInstant,
      });
      const blockers = [...assessment.blockers];
      if (
        predecessor &&
        Date.parse(importInstant) < Date.parse(predecessor.record.importInstant)
      ) {
        blockers.push('import-time-precedes-predecessor');
      }
      if (
        predecessor?.manifest.capture.sha256 !== manifest.capture.sha256 &&
        history.some(
          (version) =>
            version.manifest.capture.sha256 === manifest.capture.sha256,
        )
      ) {
        blockers.push('older-source-already-retained');
      }
      if (blockers.length) {
        return { status: 'blocked' as const, blockers };
      }
      const record = ScheduledTimetableImportRecordSchema.parse({
        schemaVersion: 1,
        documentKind: 'scheduled-timetable-import',
        manifestSha256: hash,
        predecessorSha256: predecessor?.manifestSha256 ?? null,
        importInstant,
        sourceReview,
      });
      await tx.insert(scheduledTimetablesTable).values({
        manifest_sha256: hash,
        predecessor_sha256: record.predecessorSha256,
        import_record: record,
        pages_entry: entry,
        ...files,
      });
      return { status: 'retained' as const, record };
    },
    { isolationLevel: 'read committed' },
  );
}
