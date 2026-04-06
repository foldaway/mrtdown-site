import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getIssuesIssueId } from '~/client';
import { assert } from './assert';

const InputSchema = z.object({
  issueId: z.string(),
});

export const getIssueFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    const { issueId } = val.data;

    const { data, error } = await getIssuesIssueId({
      auth: () => process.env.API_TOKEN,
      baseUrl: process.env.API_ENDPOINT,
      path: {
        issueId,
      },
    });
    if (error != null) {
      console.error('Error fetching issue:', error);
      throw new Response('Failed to fetch issue', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    assert(data != null);
    return data;
  });
