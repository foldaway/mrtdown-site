import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { getOverview } from '~/client';
import { getDateCountForViewport } from '~/helpers/getDateCountForViewport';
import { ViewportSchema } from '~/hooks/useViewport';
import { assert } from './assert';

const RequestSchema = z.object({
  viewport: ViewportSchema.optional(),
});

export const getOverviewFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => RequestSchema.parse(val))
  .handler(async (val) => {
    const viewport = val.data.viewport ?? 'xs';
    const dateCount = getDateCountForViewport(viewport);

    const { data, error } = await getOverview({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
      query: {
        days: dateCount,
      },
    });
    if (error != null) {
      console.error('Error fetching overview:', error);
      throw new Response('Failed to fetch overview', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    assert(data != null);

    return data;
  });
