import { ScheduledTimetableSourceReviewSchema } from '@mrtdown/core';
import { z } from 'zod';

export const PullParamsSchema = z
  .object({ sourceReview: ScheduledTimetableSourceReviewSchema.optional() })
  .strict();

export type PullParams = z.infer<typeof PullParamsSchema>;
