import { WorkflowNonRetryableError } from '@upstash/workflow';
import { arrivalDepartureStore } from '~/util/arrivalDepartureStore.server';
import { arrivalInputSnapshotStore } from '~/util/arrivalInputSnapshot.server';
import { rangeSnapshotStore } from '~/util/rangeSnapshotStore.server';
import { sitemapSnapshotStore } from '~/util/sitemapSnapshot.server';
import { stationProfileSnapshotStore } from '~/util/stationProfileSnapshot.server';
import { statisticsSnapshotStore } from '~/util/statisticsSnapshot.server';
import { fetchManifest } from './fetchManifest';
import { getCanonicalManifestFingerprint } from './manifestFingerprint';
import { type PullParams, resolveCombinedReleaseIndex } from './pullParams';

/** External-only preflight: no SQL imports or lease acquisition. */
export async function canSkipPublishedCanonicalPull(params: PullParams) {
  // Local SQL-only pulls and explicit repair requests must acquire the lease.
  if (
    !process.env.REDIS_URL ||
    params.sourceReview ||
    params.rebuildScheduledTimetableProjection ||
    params.seedNavigationCache ||
    params.seedServicePathCache ||
    params.seedRangeReferenceCache
  )
    return false;
  const dataUrl = process.env.MRTDOWN_DATA_URL;
  if (!dataUrl) throw new WorkflowNonRetryableError('MRTDOWN_DATA_URL not set');
  const pinned = resolveCombinedReleaseIndex(
    process.env.MRTDOWN_COMBINED_RELEASE_INDEX,
    params.combinedReleaseIndex,
  );
  const manifest = await fetchManifest(dataUrl);
  if (pinned && manifest.scheduledTimetable)
    throw new WorkflowNonRetryableError(
      'Pull must specify only one scheduled timetable format',
    );
  const fingerprint = getCanonicalManifestFingerprint(manifest, pinned);
  if (!(await rangeSnapshotStore.isCurrent(fingerprint))) return false;
  const [range, sitemap, arrivals, stations, statistics] = await Promise.all([
    rangeSnapshotStore.head(),
    sitemapSnapshotStore.read({ verifyPayload: true }),
    arrivalInputSnapshotStore.read({ verifyPayload: true }),
    stationProfileSnapshotStore.read({ verifyPayload: true }),
    statisticsSnapshotStore.read({ verifyPayload: true }),
  ]);
  if (
    !statistics ||
    statistics.value.fingerprint !== fingerprint ||
    statistics.value.generation !== range.value?.generation ||
    !stations ||
    stations.value.fingerprint !== fingerprint ||
    stations.value.generation !== range.value?.generation ||
    !sitemap ||
    sitemap.value.fingerprint !== fingerprint ||
    sitemap.value.generation !== range.value?.generation
  )
    return false;
  const metadataMatches =
    arrivals?.value.fingerprint === fingerprint &&
    arrivals.value.generation === range.value?.generation;
  if (!metadataMatches || !arrivals) return false;
  const departures = await arrivalDepartureStore.manifest.read({
    verifyPayload: true,
  });
  return Boolean(
    departures &&
      departures.value.fingerprint === fingerprint &&
      departures.value.generation === arrivals.value.generation &&
      departures.inputs.arrivalInputsSha256 === arrivals.value.sha256 &&
      (await arrivalDepartureStore.ready(departures)),
  );
}
