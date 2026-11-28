import { WorkflowNonRetryableError } from '@upstash/workflow';
import { arrivalDepartureStore } from '~/util/arrivalDepartureStore.server';
import { arrivalInputSnapshotStore } from '~/util/arrivalInputSnapshot.server';
import { issueProfileSnapshotStore } from '~/util/issueProfileSnapshot.server';
import { rangeSnapshotStore } from '~/util/rangeSnapshotStore.server';
import { reportReferenceSnapshotStore } from '~/util/reportReferenceSnapshot.server';
import { sitemapSnapshotStore } from '~/util/sitemapSnapshot.server';
import { stationProfileSnapshotStore } from '~/util/stationProfileSnapshot.server';
import { statisticsSnapshotStore } from '~/util/statisticsSnapshot.server';
import { fetchManifest } from './fetchManifest';
import { fetchPublishedTimetable } from './fetchPublishedTimetable';
import { getCanonicalManifestFingerprint } from './manifestFingerprint';
import type { PullParams } from './pullParams';

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
  const [manifest, published] = await Promise.all([
    fetchManifest(dataUrl),
    fetchPublishedTimetable(dataUrl, params),
  ]);
  if (published.combinedReleaseIndex && manifest.scheduledTimetable)
    throw new WorkflowNonRetryableError(
      'Pull must specify only one scheduled timetable format',
    );
  const fingerprint = getCanonicalManifestFingerprint(
    manifest,
    published.combinedReleaseIndex,
  );
  if (!(await rangeSnapshotStore.isCurrent(fingerprint))) return false;
  // Cold payload decoding shares the event loop and Redis command deadline.
  // Finish each verification before queuing another large payload read.
  const range = await rangeSnapshotStore.head();
  const sitemap = await sitemapSnapshotStore.read({ verifyPayload: true });
  const arrivals = await arrivalInputSnapshotStore.read({
    verifyPayload: true,
  });
  const stations = await stationProfileSnapshotStore.read({
    verifyPayload: true,
  });
  const statistics = await statisticsSnapshotStore.read({
    verifyPayload: true,
  });
  const issues = await issueProfileSnapshotStore.read({ verifyPayload: true });
  const reports = await reportReferenceSnapshotStore.read({
    verifyPayload: true,
  });
  if (
    !reports ||
    reports.value.fingerprint !== fingerprint ||
    reports.value.generation !== range.value?.generation ||
    !issues ||
    issues.value.fingerprint !== fingerprint ||
    issues.value.generation !== range.value?.generation ||
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
  const ready = Boolean(
    departures &&
      departures.value.fingerprint === fingerprint &&
      departures.value.generation === arrivals.value.generation &&
      departures.inputs.arrivalInputsSha256 === arrivals.value.sha256 &&
      (await arrivalDepartureStore.ready(departures)),
  );
  return ready
    ? { combinedReleaseIndex: published.combinedReleaseIndex ?? null }
    : false;
}
