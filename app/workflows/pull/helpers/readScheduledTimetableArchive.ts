import type { Manifest } from '@mrtdown/core';
import { readScheduledTimetablePagesBundle } from '@mrtdown/fs';
import type { ZipStore } from '~/helpers/ZipStore';
import type { VerifiedScheduledTimetableBundle } from '~/util/dbQueries/retainScheduledTimetable';

/**
 * The manifest must come from the configured, trusted Pages root, independently
 * of the ZIP. Verifies artifact integrity and release/mapping bindings only;
 * source-order review and canonical compatibility remain separate gates.
 */
export async function readScheduledTimetableArchive(
  manifest: Pick<Manifest, 'scheduledTimetable'>,
  store: Pick<ZipStore, 'readBytes'>,
): Promise<VerifiedScheduledTimetableBundle | null> {
  // The shared reader returns four raw files, but only parsed companion records.
  // Keep the companions' original bytes too, without rereading or serializing.
  const companions = new Map<string, Uint8Array>();
  const bundle = await readScheduledTimetablePagesBundle(
    manifest.scheduledTimetable,
    (path) => {
      const bytes = store.readBytes(path);
      if (
        path === 'scheduled-timetable/mapping-draft.json' ||
        path === 'scheduled-timetable/mapping-approval.json' ||
        path === 'scheduled-timetable/release-review.json'
      ) {
        companions.set(path, bytes);
      }
      return bytes;
    },
  );
  if (bundle === null) {
    return null;
  }
  function originalCompanion(name: string): Uint8Array {
    const bytes = companions.get(`scheduled-timetable/${name}`);
    if (bytes === undefined) {
      throw new Error(`Missing verified timetable companion: ${name}`);
    }
    return bytes;
  }
  return {
    entry: bundle.entry,
    files: {
      'manifest.json': bundle.manifestBytes,
      'timetable.json': bundle.timetableBytes,
      'NOTICE.txt': bundle.noticeBytes,
      'release.json': bundle.releaseBytes,
      'mapping-draft.json': originalCompanion('mapping-draft.json'),
      'mapping-approval.json': originalCompanion('mapping-approval.json'),
      'release-review.json': originalCompanion('release-review.json'),
    },
  };
}
