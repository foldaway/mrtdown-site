import { ScheduledTimetableSourceReviewSchema } from '@mrtdown/core';
import { CombinedTimetableReleaseIndexSchema } from '@mrtdown/fs';
import { z } from 'zod';

export const PullParamsSchema = z
  .object({
    sourceReview: ScheduledTimetableSourceReviewSchema.optional(),
    combinedReleaseIndex: CombinedTimetableReleaseIndexSchema.optional(),
    rebuildScheduledTimetableProjection: z.boolean().optional(),
    seedNavigationCache: z.literal(true).optional(),
    seedServicePathCache: z.literal(true).optional(),
    seedRangeReferenceCache: z.literal(true).optional(),
  })
  .strict()
  .refine(
    (params) => {
      const seedCount = [
        params.seedNavigationCache,
        params.seedServicePathCache,
        params.seedRangeReferenceCache,
      ].filter(Boolean).length;
      if (seedCount === 0) return true;
      return (
        seedCount === 1 &&
        !params.sourceReview &&
        !params.combinedReleaseIndex &&
        !params.rebuildScheduledTimetableProjection
      );
    },
    {
      message: 'Cache seeds must run separately from an import and each other',
    },
  );

export type PullParams = z.infer<typeof PullParamsSchema>;
