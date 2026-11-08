import { ScheduledTimetableSourceReviewSchema } from '@mrtdown/core';
import { CombinedTimetableReleaseIndexSchema } from '@mrtdown/fs';
import { z } from 'zod';

export const PullParamsSchema = z
  .object({
    sourceReview: ScheduledTimetableSourceReviewSchema.optional(),
    combinedReleaseIndex: CombinedTimetableReleaseIndexSchema.optional(),
  })
  .strict();

export type PullParams = z.infer<typeof PullParamsSchema>;
