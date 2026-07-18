import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getIssueReadModel } from './dbQueries/issue';

const InputSchema = z.object({
  issueId: z.string(),
});

export const getIssueFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    return getIssueReadModel(val.data.issueId);
  });
