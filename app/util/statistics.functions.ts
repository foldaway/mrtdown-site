import { createServerFn } from '@tanstack/react-start';
import { getAnalytics } from '~/client';
import { assert } from './assert';

export const getStatisticsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { data, error } = await getAnalytics({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
    });
    if (error != null) {
      console.error('Error fetching analytics:', error);
      throw new Response('Failed to fetch analytics', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    assert(data != null);
    return data;
  },
);
