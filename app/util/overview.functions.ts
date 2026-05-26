import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { getDateCountForViewport } from '~/helpers/getDateCountForViewport';
import { ViewportSchema } from '~/hooks/useViewport';
import {
  type CrowdReportFeatureEnv,
  isCrowdReportsFeatureEnabled,
} from './crowdReportFeatureFlag';
import { getOverviewData } from './db.queries';
import { timeServerSpan } from './serverTiming';

const RequestSchema = z.object({
  viewport: ViewportSchema.optional(),
});

export const getOverviewFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => RequestSchema.parse(val))
  .handler(async (val) => {
    const viewport = val.data.viewport ?? 'xs';
    const dateCount = getDateCountForViewport(viewport);
    return timeServerSpan(
      'overview_loader',
      () =>
        getOverviewData(dateCount, {
          includeCommunitySignals: isCrowdReportsFeatureEnabled(
            env as CrowdReportFeatureEnv,
            { isLocalDev: import.meta.env.DEV },
          ),
        }),
      `viewport=${viewport}`,
    );
  });
