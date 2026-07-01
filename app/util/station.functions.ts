import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  type CrowdReportFeatureEnv,
  isCrowdReportsFeatureEnabled,
} from './crowdReportFeatureFlag';
import { getStationProfileData } from './db/queries/stations';

const InputSchema = z.object({
  stationId: z.string(),
});

export const getStationProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler((val) =>
    getStationProfileData(val.data.stationId, {
      includeCommunitySignals: isCrowdReportsFeatureEnabled(
        env as CrowdReportFeatureEnv,
        { isLocalDev: import.meta.env.DEV },
      ),
    }),
  );
