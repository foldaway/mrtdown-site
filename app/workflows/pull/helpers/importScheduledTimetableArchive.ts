import type { Manifest } from '@mrtdown/core';
import { readScheduleTopology } from '@mrtdown/fs';
import { WorkflowNonRetryableError } from '@upstash/workflow';
import type { getDb } from '~/db';
import type { ZipStore } from '~/helpers/ZipStore';
import {
  COMBINED_DEPARTURE_PROJECTOR_VERSION,
  projectScheduledTimetable,
  SCHEDULED_DEPARTURE_PROJECTOR_VERSION,
} from '~/util/dbQueries/projectScheduledTimetable';
import {
  retainCombinedTimetable,
  retainScheduledTimetable,
} from '~/util/dbQueries/retainScheduledTimetable';
import type { PullParams } from './pullParams';
import { readScheduledTimetableArchive } from './readScheduledTimetableArchive';
import { createValidatedScheduledTimetableCanonicalSnapshot } from './validateScheduledTimetableCanonicalArchive';

const combinedDirectory = 'combined-timetable';

export async function importScheduledTimetableArchive(
  db: ReturnType<typeof getDb>,
  manifest: Manifest,
  store: ZipStore,
  {
    combinedReleaseIndex,
    rebuildScheduledTimetableProjection,
    ...options
  }: PullParams & { importInstant: string },
) {
  if (!combinedReleaseIndex && store.exists(combinedDirectory)) {
    throw new WorkflowNonRetryableError(
      'Combined timetable archive requires an independently trusted release index',
    );
  }
  const bundle =
    combinedReleaseIndex ??
    (await readScheduledTimetableArchive(manifest, store));
  if (!bundle) return;

  const snapshot = await createValidatedScheduledTimetableCanonicalSnapshot(
    manifest,
    store,
    'entry' in bundle ? bundle : undefined,
  );
  try {
    const result =
      'entry' in bundle
        ? await retainScheduledTimetable(db, bundle, options)
        : await retainCombinedTimetable(
            db,
            bundle,
            {
              manifestBytes: store.readBytes(
                `${combinedDirectory}/manifest.json`,
              ),
              timetableBytes: store.readBytes(
                `${combinedDirectory}/timetable.json`,
              ),
              releaseBytes: store.readBytes(
                `${combinedDirectory}/release.json`,
              ),
            },
            await readScheduleTopology(snapshot.canonicalDataDir),
            options,
          );
    if (result.status === 'blocked') {
      throw new WorkflowNonRetryableError(
        `Scheduled timetable retention blocked: ${result.blockers.join(', ')}`,
      );
    }
    console.log(`[PULL] Scheduled timetable ${result.status}`);
    await projectScheduledTimetable(db, {
      manifestSha256:
        'entry' in bundle ? bundle.entry.manifestSha256 : bundle.manifestSha256,
      projectorVersion:
        'entry' in bundle
          ? SCHEDULED_DEPARTURE_PROJECTOR_VERSION
          : COMBINED_DEPARTURE_PROJECTOR_VERSION,
      canonicalDataDir: snapshot.canonicalDataDir,
      reuseCompleted: !rebuildScheduledTimetableProjection,
    });
  } finally {
    await snapshot.dispose();
  }
}
