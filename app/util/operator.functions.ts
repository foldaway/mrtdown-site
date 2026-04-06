import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getOperatorsOperatorIdProfile } from '~/client/sdk.gen';
import { assert } from './assert';

const InputSchema = z.object({
  operatorId: z.string(),
  days: z.number().optional().default(90),
});

export const getOperatorProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { operatorId, days } = val.data;
    const { data, error, response } = await getOperatorsOperatorIdProfile({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
      path: {
        operatorId,
      },
      query: {
        days,
      },
    });
    if (error != null) {
      console.error('Error fetching operator profile:', error);
      throw new Response('Failed to fetch operator profile', {
        status: response.status,
        statusText: response.statusText,
      });
    }
    assert(data != null);
    return { ...data, dateCount: days };
  });
