import { ScheduledTimetableSourceReviewSchema } from '@mrtdown/core';
import { CombinedTimetableReleaseIndexSchema } from '@mrtdown/fs';
import { WorkflowNonRetryableError } from '@upstash/workflow';
import { z } from 'zod';

export const PullParamsSchema = z
  .object({
    sourceReview: ScheduledTimetableSourceReviewSchema.optional(),
    combinedReleaseIndex: CombinedTimetableReleaseIndexSchema.optional(),
    rebuildScheduledTimetableProjection: z.boolean().optional(),
    seedNavigationCache: z.literal(true).optional(),
  })
  .strict()
  .refine(
    (params) =>
      !params.seedNavigationCache ||
      (!params.sourceReview &&
        !params.combinedReleaseIndex &&
        !params.rebuildScheduledTimetableProjection),
    { message: 'Navigation cache seed must run separately from an import' },
  );

export type PullParams = z.infer<typeof PullParamsSchema>;

export function resolveCombinedReleaseIndex(
  configured: string | undefined,
  requested: PullParams['combinedReleaseIndex'],
) {
  if (!configured?.trim()) return requested;
  let pinned: NonNullable<PullParams['combinedReleaseIndex']>;
  try {
    pinned = CombinedTimetableReleaseIndexSchema.parse(JSON.parse(configured));
  } catch {
    throw new WorkflowNonRetryableError(
      'Invalid MRTDOWN_COMBINED_RELEASE_INDEX',
    );
  }
  if (
    requested &&
    (requested.manifestSha256 !== pinned.manifestSha256 ||
      requested.releaseSha256 !== pinned.releaseSha256)
  ) {
    throw new WorkflowNonRetryableError(
      'Requested combined release index differs from MRTDOWN_COMBINED_RELEASE_INDEX',
    );
  }
  return pinned;
}
