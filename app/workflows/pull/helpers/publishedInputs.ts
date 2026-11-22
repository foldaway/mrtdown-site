import { WorkflowNonRetryableError } from '@upstash/workflow';
import {
  arrivalDepartureStore,
  isArrivalDeparturePublicationEnabled,
} from '~/util/arrivalDepartureStore.server';
import {
  arrivalInputSnapshotStore,
  isArrivalInputPublicationEnabled,
} from '~/util/arrivalInputSnapshot.server';
import {
  isRangeSnapshotEnabled,
  rangeSnapshotStore,
} from '~/util/rangeSnapshotStore.server';
import { fetchManifest } from './fetchManifest';
import { getCanonicalManifestFingerprint } from './manifestFingerprint';
import { type PullParams, resolveCombinedReleaseIndex } from './pullParams';

/** External-only preflight: no SQL imports or lease acquisition. */
export async function canSkipPublishedCanonicalPull(params: PullParams) {
  // Publish-only mode keeps the original SQL/legacy-cache renewal behavior.
  if (
    !isRangeSnapshotEnabled() ||
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
  if (!isArrivalInputPublicationEnabled())
    return !isArrivalDeparturePublicationEnabled();
  const [range, arrivals] = await Promise.all([
    rangeSnapshotStore.head(),
    arrivalInputSnapshotStore.read({ verifyPayload: true }),
  ]);
  const metadataMatches =
    arrivals?.value.fingerprint === fingerprint &&
    arrivals.value.generation === range.value?.generation;
  if (!metadataMatches || !arrivals) return false;
  if (!isArrivalDeparturePublicationEnabled()) return true;
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
