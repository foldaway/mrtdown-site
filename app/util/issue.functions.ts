import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getIssueData } from './db.queries';

const InputSchema = z.object({
  issueId: z.string(),
});

export const getIssueFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    return getIssueData(val.data.issueId);
  });
