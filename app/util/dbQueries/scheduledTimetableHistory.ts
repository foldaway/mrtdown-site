import {
  assessScheduledTimetableSourceChange,
  type ScheduledTimetableArtifactManifest,
  ScheduledTimetableArtifactManifestSchema,
} from '@mrtdown/core';
import {
  hashBytes,
  type ScheduledTimetableImportRecord,
  ScheduledTimetableImportRecordSchema,
} from '@mrtdown/fs';
import { scheduledTimetablesTable as timetables } from '~/db/scheduledTimetables.schema';
import { readCombinedTimetableAdmissionManifest } from './combinedTimetableAdmission';

export const scheduledTimetableHistoryColumns = {
  hash: timetables.manifest_sha256,
  predecessor: timetables.predecessor_sha256,
  receipt: timetables.import_record,
  manifestBytes: timetables.manifest_bytes,
  combinedRelease: timetables.combined_release,
};

type HistoryRow = {
  hash: string;
  predecessor: string | null;
  receipt: unknown;
  manifestBytes: Buffer;
  combinedRelease: unknown;
};

type Version = {
  manifestSha256: string;
  manifest: ScheduledTimetableArtifactManifest;
  serviceDateRange: ScheduledTimetableArtifactManifest['feedRange'];
  record: ScheduledTimetableImportRecord;
  format: 'legacy' | 'combined';
};

/** Validate the one source-admission chain across both formats using metadata only. */
export function validateScheduledTimetableHistory(rows: HistoryRow[]) {
  const successors = new Map<string | null, Version>();
  const identities = new Set<string>();
  for (const row of rows) {
    const record = ScheduledTimetableImportRecordSchema.parse(row.receipt);
    if (
      record.manifestSha256 !== row.hash ||
      record.predecessorSha256 !== row.predecessor
    ) {
      throw new Error('Retained timetable receipt disagrees with its row');
    }
    if (successors.has(row.predecessor) || identities.has(row.hash)) {
      throw new Error(
        'Retained timetable history has a conflicting identity or predecessor',
      );
    }
    if (hashBytes(row.manifestBytes) !== row.hash) {
      throw new Error(
        `Retained timetable manifest does not match its row: ${row.hash}`,
      );
    }
    const legacyManifest =
      row.combinedRelease === null
        ? ScheduledTimetableArtifactManifestSchema.parse(
            JSON.parse(
              new TextDecoder('utf-8', { fatal: true }).decode(
                row.manifestBytes,
              ),
            ),
          )
        : undefined;
    const source = legacyManifest
      ? { manifest: legacyManifest, serviceDateRange: legacyManifest.feedRange }
      : readCombinedTimetableAdmissionManifest(
          row.hash,
          row.manifestBytes,
          row.combinedRelease,
        );
    identities.add(row.hash);
    successors.set(row.predecessor, {
      manifestSha256: row.hash,
      ...source,
      record,
      format: legacyManifest ? 'legacy' : 'combined',
    });
  }

  const history: Version[] = [];
  const seenSources = new Set<string>();
  let predecessor: Version | undefined;
  while (successors.size > 0) {
    const version = successors.get(predecessor?.manifestSha256 ?? null);
    if (!version) {
      throw new Error('Retained timetable history is incomplete or cyclic');
    }
    const { manifestSha256, manifest, record } = version;
    if (
      predecessor &&
      Date.parse(record.importInstant) <
        Date.parse(predecessor.record.importInstant)
    ) {
      throw new Error(
        'Retained timetable import time precedes its predecessor',
      );
    }
    if (
      seenSources.has(manifest.capture.sha256) &&
      predecessor?.manifest.capture.sha256 !== manifest.capture.sha256
    ) {
      throw new Error(
        'Retained timetable history reintroduces an older source snapshot',
      );
    }
    const assessment = assessScheduledTimetableSourceChange({
      candidate: { manifestSha256, manifest },
      incumbent: predecessor && {
        manifestSha256: predecessor.manifestSha256,
        manifest: predecessor.manifest,
      },
      review: record.sourceReview,
      importInstant: record.importInstant,
    });
    if (!assessment.sourceEligible) {
      throw new Error(
        `Invalid retained timetable source review: ${assessment.blockers.join(', ')}`,
      );
    }
    successors.delete(record.predecessorSha256);
    history.push(version);
    seenSources.add(manifest.capture.sha256);
    predecessor = version;
  }
  return history;
}
