import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { getLineProfileData } from './db.queries';

const InputSchema = z.object({
  lineId: z.string(),
  days: z.number().optional().default(90),
});

export const getLineProfileFn = createServerFn({ method: 'GET' })
  .inputValidator((val) => InputSchema.parse(val))
  .handler(async (val) => {
    return getLineProfileData(val.data.lineId, val.data.days);
  });
