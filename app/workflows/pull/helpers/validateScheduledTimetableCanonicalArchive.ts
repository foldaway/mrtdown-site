import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Manifest } from '@mrtdown/core';
import {
  entityPath,
  hashBytes,
  listEntities,
  verifyScheduledTimetableForCanonicalData,
} from '@mrtdown/fs';
import type { ZipStore } from '~/helpers/ZipStore';
import type { VerifiedScheduledTimetableBundle } from '~/util/dbQueries/retainScheduledTimetable';

const domains = [
  ['operator', 'operators'],
  ['line', 'lines'],
  ['station', 'stations'],
  ['service', 'services'],
] as const;

/** Bind the shared filesystem validator to this pull's trusted archive inputs. */
export async function validateScheduledTimetableCanonicalArchive(
  manifest: Manifest,
  store: Pick<ZipStore, 'readBytes' | 'listDir'>,
  bundle: VerifiedScheduledTimetableBundle,
): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-timetable-'));
  try {
    for (const [collection, key] of domains) {
      const expected = Object.keys(manifest[key]).sort();
      const files = store.listDir(collection).sort();
      if (
        JSON.stringify(files) !==
        JSON.stringify(expected.map((id) => `${id}.json`).sort())
      ) {
        throw new Error(
          `Canonical ${collection} files differ from root manifest`,
        );
      }
      await mkdir(join(dataDir, collection));
      for (const id of expected) {
        // entityPath rejects unsafe IDs; readBytes rejects duplicate ZIP entries.
        const path = entityPath(dataDir, collection, id);
        await writeFile(path, store.readBytes(`${collection}/${id}.json`));
      }
      for (const record of await listEntities(dataDir, collection)) {
        // buildManifest hashes schema-parsed JSON, not the original file bytes.
        if (
          record.value.id !== record.id ||
          hashBytes(Buffer.from(JSON.stringify(record.value))) !==
            manifest[key][record.id]
        ) {
          throw new Error(
            `Canonical ${record.path} differs from root manifest`,
          );
        }
      }
    }
    // Only canonical domains go to disk. Reuse the verified timetable bytes.
    await verifyScheduledTimetableForCanonicalData(
      bundle.files['manifest.json'],
      bundle.entry.manifestSha256,
      {
        timetableBytes: bundle.files['timetable.json'],
        noticeBytes: bundle.files['NOTICE.txt'],
      },
      { dataDir },
    );
  } catch (error) {
    throw new Error(
      `Scheduled timetable canonical compatibility failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}
