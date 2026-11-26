import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getDb } from '~/db';
import { getCachedCrowdReportSource } from './crowdReportSourceCache.server';

export type {
  CrowdReportSource,
  CrowdReportSourceLine,
  CrowdReportSourceStation,
} from './crowdReportSource';

const RequestSchema = z.object({
  kind: z.enum(['cluster', 'report']),
  sourceId: z.string().trim().min(1).max(128),
});

export const getCrowdReportSourceFn = createServerFn({ method: 'GET' })
  .inputValidator((value) => RequestSchema.parse(value))
  .handler(async ({ data }) => {
    const source = await getCachedCrowdReportSource(data, getDb);
    if (source == null) {
      throw new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      });
    }
    return source;
  });
