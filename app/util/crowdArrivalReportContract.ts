import { z } from 'zod';

export const CROWD_ARRIVAL_COOLDOWN_SECONDS = 30;

export const arrivalScopeId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const crowdArrivalSubmissionSchema = z.strictObject({
  stationId: arrivalScopeId,
  lineId: arrivalScopeId,
  serviceId: arrivalScopeId,
  destinationStationId: arrivalScopeId,
  minutesToArrival: z.number().int().min(0).max(30),
});

export const recentCrowdArrivalSchema = z.object({
  reportedAt: z.iso.datetime({ offset: true }),
  expectedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type CrowdArrivalSubmission = z.infer<
  typeof crowdArrivalSubmissionSchema
>;
export type RecentCrowdArrival = z.infer<typeof recentCrowdArrivalSchema>;
