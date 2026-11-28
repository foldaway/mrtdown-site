import { isDeepStrictEqual } from 'node:util';
import { ScheduledTimetableSourceReviewSchema } from '@mrtdown/core';
import { CombinedTimetableReleaseIndexSchema } from '@mrtdown/fs';
import { WorkflowNonRetryableError } from '@upstash/workflow';
import { z } from 'zod';
import type { PullParams } from './pullParams';

const publicationSchema = z.strictObject({
  combinedReleaseIndex: CombinedTimetableReleaseIndexSchema,
  sourceReview: ScheduledTimetableSourceReviewSchema,
});

async function readPublishedJson(dataUrl: string, name: string) {
  const response = await fetch(`${dataUrl}/${name}`, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
  return response.json();
}

/** Read the publisher's current index outside archive.zip. Older Pages
 * releases have only the index and can replay an already retained import. */
export async function fetchPublishedTimetable(
  dataUrl: string,
  params: Pick<PullParams, 'combinedReleaseIndex' | 'sourceReview'>,
) {
  const [rawIndex, rawPublication] = await Promise.all([
    readPublishedJson(dataUrl, 'combined-timetable-release-index.json'),
    readPublishedJson(dataUrl, 'combined-timetable-publication.json'),
  ]);
  const combinedReleaseIndex = rawIndex
    ? CombinedTimetableReleaseIndexSchema.parse(rawIndex)
    : undefined;
  const publication = rawPublication
    ? publicationSchema.parse(rawPublication)
    : undefined;
  if (
    publication &&
    !isDeepStrictEqual(publication.combinedReleaseIndex, combinedReleaseIndex)
  ) {
    throw new WorkflowNonRetryableError(
      'Published timetable receipt differs from the release index',
    );
  }
  if (
    publication &&
    publication.sourceReview.successor.manifestSha256 !==
      combinedReleaseIndex?.manifestSha256
  ) {
    throw new WorkflowNonRetryableError(
      'Published source review does not bind the release index',
    );
  }
  if (
    params.combinedReleaseIndex &&
    !isDeepStrictEqual(params.combinedReleaseIndex, combinedReleaseIndex)
  ) {
    throw new WorkflowNonRetryableError(
      'Requested combined release index differs from the published release',
    );
  }
  return {
    combinedReleaseIndex,
    sourceReview: params.sourceReview ?? publication?.sourceReview,
  };
}
