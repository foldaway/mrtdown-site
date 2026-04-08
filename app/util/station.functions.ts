import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getStationsStationIdProfile } from '~/client';
import { assert } from './assert';

const InputSchema = z.object({
  stationId: z.string(),
});

export const getStationProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { stationId } = val.data;

    const { data, error } = await getStationsStationIdProfile({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
      path: {
        stationId,
      },
    });
    if (error != null) {
      console.error('Error fetching station profile:', error);
      throw new Response('Failed to fetch station profile', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    assert(data != null);
    return data;
  });
