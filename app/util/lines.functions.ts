import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { getLinesLineIdProfile } from '~/client';
import { assert } from './assert';

const InputSchema = z.object({
  lineId: z.string(),
  days: z.number().optional().default(90),
});

export const getLineProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { lineId } = val.data;

    const { data, error } = await getLinesLineIdProfile({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
      path: {
        lineId,
      },
      query: {
        days: val.data.days,
      },
    });
    if (error != null) {
      console.error('Error fetching line profile:', error);
      throw new Response('Failed to fetch line profile', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    assert(data != null);
    return data;
  });
